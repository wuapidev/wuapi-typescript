// Copied by wuapi-codegen from packages/sdk-codegen/templates/typescript/test/stream.test.ts. Do not edit here.

// The stream runtime outside the conformance scenarios: the parser on its
// own, where the stream connects to, how a caller iterates, observes and
// stops it, and the real clock.
import { describe, expect, expectTypeOf, it } from "vitest";
import { DEFAULT_BASE_URL, HttpClient, WuapiError, type ClientOptions, type FetchLike } from "../src/index.js";
import { EventStream, SseParser, StreamError, type StreamItem, type StreamOptions, type StreamSpec, type StreamStatus } from "../src/stream.js";
import { KEY } from "./helpers.js";
import { STREAM_HOST, VirtualClock, scriptedFetch, settle, suiteSpec, type ScriptedResponse } from "./stream-helpers.js";

const spec = suiteSpec();
const SSE = { "content-type": "text/event-stream" };
const envelope = (n: number) => ({ id: `evt_${n}`, object: "event", type: "message.received" });
const frame = (n: number, cursor: string) => `id: ${cursor}\nevent: message.received\ndata: ${JSON.stringify(envelope(n))}\n\n`;
const body = (...texts: string[]): ScriptedResponse => ({ status: 200, headers: SSE, stream: texts.map((text) => ({ text })), end: "close" });
const open = (...texts: string[]): ScriptedResponse => ({ ...body(...texts), end: "hang" });

/** A stream over a scripted server and virtual time. */
function scripted(responses: ScriptedResponse[], options: StreamOptions = {}, client: ClientOptions = {}) {
  const clock = new VirtualClock();
  const { fetch, seen } = scriptedFetch(clock, responses);
  const http = new HttpClient({ apiKey: KEY, fetch, streamBaseUrl: STREAM_HOST, ...client });
  const stream = new EventStream<ReturnType<typeof envelope>>(http, spec, {}, options, clock);
  return { clock, seen, http, stream };
}

/** Resolves `work`, moving the clock while it waits. */
async function run<T>(clock: VirtualClock, work: Promise<T>): Promise<T> {
  let state: { value: T } | { error: unknown } | undefined;
  work.then(
    (value) => (state = { value }),
    (error: unknown) => (state = { error }),
  );
  for (;;) {
    await settle();
    if (state) break;
    clock.step();
  }
  if ("error" in state) throw state.error;
  return state.value;
}

const bytes = (text: string) => new TextEncoder().encode(text);

describe("SseParser", () => {
  const parse = (...chunks: (string | number[])[]) => {
    const parser = new SseParser(1024);
    return chunks.flatMap((chunk) => parser.feed(typeof chunk === "string" ? bytes(chunk) : Uint8Array.from(chunk)));
  };

  it("reports events, cursors, retries and comments", () => {
    expect(parse(": ping\nid: c1\n\n", "retry: 7000\n\n", "id: c2\nevent: x\ndata: one\ndata: two\n\n")).toEqual([
      { kind: "comment" },
      { kind: "cursor", id: "c1" },
      { kind: "retry", ms: 7000 },
      { kind: "event", event: "x", data: "one\ntwo", id: "c2" },
    ]);
  });

  it("skips one byte order mark, and only a whole one at the very start", () => {
    const one = { kind: "event", event: "message", data: "1", id: undefined };
    expect(parse([0xef, 0xbb, 0xbf], "data: 1\n\n")).toEqual([one]);
    expect(parse([0xef], [0xbb], [0xbf, 0x64], "ata: 1\n\n")).toEqual([one]);
    // U+FB01 starts with the mark's first byte and is not one.
    expect(parse("ﬁeld: x\ndata: 1\n\n")).toEqual([one]);
    expect(parse("data: 1\n\n", [0xef, 0xbb, 0xbf], "data: 2\n\n")).toEqual([one]);
  });

  it("gives the same result for every split of the bytes", () => {
    const text = `retry: 10\r\n\r\n: c\r${frame(1, "c1.a").replace(/\n/g, "\r\n")}data: café €\n\n`;
    const whole = parse(text);
    expect(whole).toHaveLength(4);
    const all = bytes(text);
    for (let cut = 1; cut < all.length; cut++) {
      const parser = new SseParser(1024);
      expect([...parser.feed(all.slice(0, cut)), ...parser.feed(all.slice(cut))], `cut at ${cut}`).toEqual(whole);
    }
  });

  it("drops a line or a frame over the cap and keeps its id", () => {
    const parser = new SseParser(16);
    expect(parser.feed(bytes(`id: c1\ndata: ${"x".repeat(40)}\n\n`))).toEqual([{ kind: "oversized" }, { kind: "cursor", id: "c1" }]);
    expect(parser.feed(bytes("data: 12345\ndata: 67890\nevent: late\n\n"))).toEqual([{ kind: "oversized" }]);
    expect(parser.feed(bytes("data: ok\n\n"))).toEqual([{ kind: "event", event: "message", data: "ok", id: undefined }]);
  });
});

describe("where a stream connects", () => {
  const first = async (client: ClientOptions, init: ConstructorParameters<typeof EventStream>[2] = {}) => {
    const clock = new VirtualClock();
    const { fetch, seen } = scriptedFetch(clock, [open()]);
    const stream = new EventStream(new HttpClient({ apiKey: KEY, fetch, ...client }), { ...spec, baseUrl: "https://stream.example.test" }, init, {}, clock);
    const items = stream.items();
    expect((await run(clock, items.next())).value).toEqual({ type: "open" });
    stream.close();
    await items.next();
    return seen[0]!;
  };

  it("is the stream's own host for the API's default URL", async () => {
    expect((await first({})).url.href).toBe(`https://stream.example.test${spec.path}`);
    expect((await first({ baseUrl: `${DEFAULT_BASE_URL}/` })).url.origin).toBe("https://stream.example.test");
  });

  it("is the API's own origin for any other API URL, so its key never reaches the production stream", async () => {
    expect((await first({ baseUrl: "https://api.staging.example.test/base" })).url.href).toBe(`https://api.staging.example.test${spec.path}`);
    expect((await first({ baseUrl: "http://localhost:8787" })).url.origin).toBe("http://localhost:8787");
  });

  it("is the stream URL the client was given, before either", async () => {
    const seen = await first({ baseUrl: "https://api.staging.example.test", streamBaseUrl: "http://127.0.0.1:9000/" });
    expect(seen.url.href).toBe(`http://127.0.0.1:9000${spec.path}`);
    expect((await first({ streamBaseUrl: "http://[::1]:9000" })).url.hostname).toBe("[::1]");
  });

  it("refuses a URL the key must not travel to", () => {
    const fetch: FetchLike = async () => new Response(null);
    for (const streamBaseUrl of [
      "http://stream.example.test",
      "ftp://stream.example.test",
      "https://user@stream.example.test",
      "https://user:secret@stream.example.test",
      "https://stream.example.test?key=1",
      "https://stream.example.test#top",
      "not a url",
    ]) {
      const http = new HttpClient({ apiKey: KEY, fetch, streamBaseUrl });
      expect(() => new EventStream(http, spec), streamBaseUrl).toThrow("the stream URL must be https");
    }
    expect(() => new EventStream(new HttpClient({ apiKey: KEY, fetch, baseUrl: "nowhere" }), spec)).toThrow();
  });

  it("sends filters comma-joined, leaves out empty ones, and sends no empty cursor", async () => {
    const seen = await first({}, { filters: { types: ["a", "b"], accounts: [], extra: undefined }, lastEventId: "" });
    expect(seen.url.search).toBe("?types=a%2Cb");
    expect(seen.headers["last-event-id"]).toBeUndefined();
  });
});

describe("iterating a stream", () => {
  it("yields typed events and tells onStatus about everything else", async () => {
    const statuses: StreamStatus[] = [];
    const { clock, stream } = scripted([body(frame(1, "c1.a")), open(frame(2, "c1.b"))], { onStatus: (s) => statuses.push(s) });
    expect(stream.state).toBe("connecting");
    expect(stream.lastEventId).toBeUndefined();
    const events: unknown[] = [];
    const states: string[] = [];
    await run(
      clock,
      (async () => {
        for await (const event of stream) {
          expectTypeOf(event).toEqualTypeOf<ReturnType<typeof envelope>>();
          events.push(event);
          states.push(stream.state);
          if (events.length === 2) break;
        }
      })(),
    );
    expect(events).toEqual([envelope(1), envelope(2)]);
    expect(states).toEqual(["open", "open"]);
    expect(statuses).toEqual([{ type: "open" }, { type: "reconnecting", reason: "ended", delayMs: 3000, failures: 1 }, { type: "open" }]);
    expect(stream.lastEventId).toBe("c1.b");
    expect(stream.state).toBe("closed");
  });

  it("can be iterated once", async () => {
    const { stream } = scripted([]);
    stream.close();
    expect((await stream.items().next()).done).toBe(true);
    await expect(stream.items().next()).rejects.toThrow("only once");
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toThrow("only once");
  });

  it("is waiting between connects", async () => {
    const { clock, stream } = scripted([{ unreachable: true }, open()]);
    const items = stream.items();
    expect((await run(clock, items.next())).value).toMatchObject({ type: "reconnecting", reason: "unreachable", message: "fetch failed" });
    expect(stream.state).toBe("waiting");
    expect((await run(clock, items.next())).value).toEqual({ type: "open" });
    expect(stream.state).toBe("open");
    stream.close();
    expect((await items.next()).done).toBe(true);
  });

  it("forgets the oldest id when the dedupe window is full", async () => {
    const frames = [frame(1, "a"), frame(2, "b"), frame(1, "c"), frame(2, "d"), frame(2, "e"), frame(3, "f")];
    const { clock, stream } = scripted([open(...frames)], { dedupeWindow: 1 });
    const ids: unknown[] = [];
    const items = stream.items();
    while (ids.length < 3) {
      const item = (await run(clock, items.next())).value as StreamItem<unknown>;
      if (item.type === "event") ids.push([item.id, item.cursor]);
    }
    // 1 again is delivered (2 pushed it out); 2 right after 2 is not.
    expect(ids).toEqual([["evt_1", "a"], ["evt_2", "b"], ["evt_1", "c"]]);
    expect((await run(clock, items.next())).value).toMatchObject({ id: "evt_2", cursor: "d" });
    expect((await run(clock, items.next())).value).toMatchObject({ id: "evt_3", cursor: "f" });
    stream.close();
    await items.next();
    expect(stream.lastEventId).toBe("f");
  });

  it("reads a reset without a reason, and skips data that is null", async () => {
    const { clock, stream } = scripted([open("event: reset\ndata: null\n\n", 'event: reset\ndata: {"reason":5}\n\n', "data: null\n\n")]);
    const items = stream.items();
    const got: unknown[] = [];
    for (let i = 0; i < 4; i++) got.push((await run(clock, items.next())).value);
    expect(got).toEqual([
      { type: "open" },
      { type: "reset", reason: "unknown" },
      { type: "reset", reason: "unknown" },
      { type: "skipped", reason: "invalid_data", name: "message" },
    ]);
    stream.close();
    await items.next();
  });
});

describe("stopping a stream", () => {
  it("never connects when its signal is already aborted", async () => {
    const { seen, stream } = scripted([], { signal: AbortSignal.abort() });
    for await (const event of stream) throw new Error(`unexpected ${JSON.stringify(event)}`);
    expect(seen).toHaveLength(0);
    expect(stream.state).toBe("closed");
  });

  it("ends on its signal while it reads, and closes the connection", async () => {
    const controller = new AbortController();
    // Two frames in one chunk: the second is not delivered after the abort.
    const { clock, stream } = scripted([open(frame(1, "c1.a") + frame(2, "c1.b"))], { signal: controller.signal });
    const events: unknown[] = [];
    await run(
      clock,
      (async () => {
        for await (const event of stream) {
          events.push(event);
          controller.abort();
        }
      })(),
    );
    expect(events).toEqual([envelope(1)]);
    expect(stream.state).toBe("closed");
  });

  it("ends while it connects", async () => {
    const { clock, seen, stream } = scripted([{ hang: true }]);
    const items = stream.items();
    const next = items.next();
    await settle();
    expect(seen).toHaveLength(1);
    stream.close();
    expect((await run(clock, next)).done).toBe(true);
    expect(clock.next()).toBeUndefined();
  });

  it("closes the connection when the caller stops iterating", async () => {
    let signal: AbortSignal | undefined;
    const fetch: FetchLike = async (_url, init) => {
      signal = init.signal!;
      return new Response(frame(1, "c1.a"), { status: 200, headers: SSE });
    };
    const stream = new EventStream(new HttpClient({ apiKey: KEY, fetch, streamBaseUrl: STREAM_HOST }), spec);
    for await (const event of stream) {
      expect(event).toEqual(envelope(1));
      break;
    }
    expect(signal!.aborted).toBe(true);
  });
});

describe("answers that are not the stream", () => {
  const refusedBy = async (response: Response | (() => Promise<Response>), options: StreamOptions = {}) => {
    const clock = new VirtualClock();
    const fetch: FetchLike = async () => (typeof response === "function" ? response() : response);
    const stream = new EventStream(new HttpClient({ apiKey: KEY, fetch, streamBaseUrl: STREAM_HOST }), spec, {}, options, clock);
    const items = stream.items();
    try {
      return (await run(clock, items.next())).value;
    } finally {
      stream.close();
    }
  };

  it("is a typed terminal error with the API's code, message and Retry-After", async () => {
    const response = new Response(JSON.stringify({ code: "organization_suspended", message: "Suspended." }), { status: 403, headers: { "retry-after": "7" } });
    const error = await refusedBy(response).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StreamError);
    expect(error).toBeInstanceOf(WuapiError);
    expect(error).toMatchObject({ name: "StreamError", kind: "forbidden", status: 403, code: "organization_suspended", message: "Suspended.", retryAfter: 7 });
  });

  it("names the status when the body is not the API's", async () => {
    for (const text of ["null", '{"code":7,"message":"x"}', '{"code":"x"}', "<html>"]) {
      const error = await refusedBy(new Response(text, { status: 404 })).catch((e: unknown) => e);
      expect(error, text).toMatchObject({ kind: "not_found", status: 404, code: "http_404", message: "The stream answered 404." });
    }
  });

  it("takes an event stream without a body for no stream at all", async () => {
    const error = await refusedBy(new Response(null, { status: 200, headers: SSE })).catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: "unexpected_response", status: 200 });
  });

  it("retries an answer with no body and no content type", async () => {
    expect(await refusedBy(new Response(null, { status: 503 }))).toEqual({ type: "reconnecting", reason: "refused", status: 503, delayMs: 3000, failures: 1 });
  });

  it("reads no more of a refusal's body than it needs", async () => {
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(16 * 1024).fill(0x20));
      },
    });
    expect(await refusedBy(new Response(endless, { status: 500 }))).toMatchObject({ type: "reconnecting", status: 500 });
    expect(pulled).toBeLessThan(8);
  });

  it("says what failed when a connect gets no answer, whatever was thrown", async () => {
    const thrown = await refusedBy(async () => {
      throw "socket closed";
    });
    expect(thrown).toMatchObject({ reason: "unreachable", message: "socket closed" });
  });

  it("is unreachable, not given up, when the connect times out before the give-up time", async () => {
    const { clock, stream } = scripted([{ hang: true }], { giveUpAfterMs: 100_000 });
    const items = stream.items();
    expect((await run(clock, items.next())).value).toEqual({
      type: "reconnecting",
      reason: "unreachable",
      message: "The connection took too long.",
      delayMs: 3000,
      failures: 1,
    });
    expect(clock.time).toBe(spec.timing.openTimeoutMs);
    stream.close();
    await items.next();
  });
});

describe("the connect budget", () => {
  it("is shared by every stream of one client", async () => {
    const { clock, http, seen, stream } = scripted([open(), open(), open(), open(), open(), open(), open()]);
    const streams = [stream, ...Array.from({ length: 6 }, () => new EventStream(http, spec, {}, {}, clock))];
    const firsts = streams.map((s) => s.items().next());
    await settle();
    // Six connect at once; the seventh waits for the window to pass.
    expect(seen).toHaveLength(6);
    expect(streams[6]!.state).toBe("waiting");
    await run(clock, firsts[6]!);
    expect(seen).toHaveLength(7);
    expect(seen[6]!.at).toBe(spec.limits.connectBudgetWindowMs);
    for (const s of streams) s.close();
  });
});

describe("the real clock", () => {
  const fast: StreamSpec = {
    ...spec,
    timing: { ...spec.timing, retryMs: 1, minGapMs: 1, backoffBaseMs: 1, backoffCapMs: 2, idleTimeoutMs: 40, openTimeoutMs: 40 },
  };
  const answers = (...responses: (() => Response)[]): { fetch: FetchLike; calls: number[] } => {
    const calls: number[] = [];
    const fetch: FetchLike = async () => {
      calls.push(Date.now());
      return responses[Math.min(calls.length, responses.length) - 1]!();
    };
    return { fetch, calls };
  };
  const sse = (text: string) => () => new Response(text, { status: 200, headers: SSE });

  it("reconnects after the wait and resumes", async () => {
    const { fetch, calls } = answers(sse(frame(1, "c1.a")), sse(frame(2, "c1.b")));
    const stream = new EventStream(new HttpClient({ apiKey: KEY, fetch, streamBaseUrl: STREAM_HOST }), fast);
    const events: unknown[] = [];
    for await (const event of stream) {
      events.push(event);
      if (events.length === 2) break;
    }
    expect(events).toEqual([envelope(1), envelope(2)]);
    expect(calls).toHaveLength(2);
    expect(calls[1]! - calls[0]!).toBeGreaterThanOrEqual(1);
  });

  it("stops waiting as soon as it is closed", async () => {
    const { fetch, calls } = answers(() => new Response(null, { status: 503, headers: { "retry-after": "60" } }));
    const stream = new EventStream(new HttpClient({ apiKey: KEY, fetch, streamBaseUrl: STREAM_HOST }), fast);
    const items = stream.items();
    expect((await items.next()).value).toMatchObject({ type: "reconnecting", delayMs: 60_000 });
    const started = Date.now();
    const next = items.next();
    setTimeout(() => stream.close(), 5);
    expect((await next).done).toBe(true);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(calls).toHaveLength(1);
  });

  it("ends a silent connection after the idle time", async () => {
    const silent = () => new Response(new ReadableStream<Uint8Array>({ start: (c) => c.enqueue(bytes(": ping\n\n")) }), { status: 200, headers: SSE });
    const { fetch } = answers(silent);
    const stream = new EventStream(new HttpClient({ apiKey: KEY, fetch, streamBaseUrl: STREAM_HOST }), fast);
    const items = stream.items();
    expect((await items.next()).value).toEqual({ type: "open" });
    expect((await items.next()).value).toMatchObject({ type: "reconnecting", reason: "idle" });
    stream.close();
    expect((await items.next()).done).toBe(true);
  });
});
