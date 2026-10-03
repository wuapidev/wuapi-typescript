// Copied by wuapi-codegen from packages/sdk-codegen/templates/typescript/src/stream.ts. Do not edit here.

// The event stream runtime: one long-lived `GET` answered with
// `text/event-stream`, read with `fetch`, reconnected and resumed by itself.
// It follows packages/sdk-codegen/streams/CONTRACT.md, and
// test/stream-conformance.test.ts holds it to that contract with the
// scenarios every SDK shares. `EventSource` is not used: it cannot send the
// Authorization header.

import { parseRetryAfter, type HttpClient } from "./core.js";
import { WuapiError } from "./errors.js";
import { DEFAULT_BASE_URL } from "./meta.js";

/** The stream's times, in milliseconds. */
export interface StreamTiming {
  /** The reconnection time before the stream sends a `retry:` of its own. */
  retryMs: number;
  /** How often the server sends a heartbeat comment when idle. */
  heartbeatMs: number;
  /** Silence after which a connection is taken for dead. */
  idleTimeoutMs: number;
  /** Bound on a connect, up to the response headers. */
  openTimeoutMs: number;
  /** First step of the random part of the reconnect wait. */
  backoffBaseMs: number;
  /** Largest step of the random part of the reconnect wait. */
  backoffCapMs: number;
  /** Smallest wait between two connects. */
  minGapMs: number;
  /** A connection open this long resets the failure count. */
  stableAfterMs: number;
  /** Clamp on a server-sent `retry:`. */
  retryMaxMs: number;
  /** Clamp on a server-sent `Retry-After`. */
  retryAfterMaxMs: number;
  /** How far back a cursor can resume. */
  replayWindowMs: number;
}

/** The stream's sizes and counts. */
export interface StreamLimits {
  /** Connects one client may start in one `connectBudgetWindowMs`. */
  connectBudget: number;
  connectBudgetWindowMs: number;
  /** Largest frame accepted, in bytes. */
  maxFrameBytes: number;
  /** Event ids remembered to drop a replay's repeats. */
  dedupeWindow: number;
}

/** What one answer that is not the stream means. */
export interface StreamRefusal {
  status: number;
  /** Only for answers whose error body has this `code`. */
  code?: string;
  /** The terminal error this answer is. Without it the answer is retried. */
  error?: "unauthorized" | "forbidden" | "invalid_request" | "not_found" | "refused";
  /** Terminal only when the body is the API's error; otherwise retried. */
  apiOnly?: boolean;
  /** The wait before the next connect when the answer has no `Retry-After`. */
  waitMs?: number;
}

/** The description of a stream: what the generator read from its config. */
export interface StreamSpec {
  /** The stream host's production URL. */
  baseUrl: string;
  path: string;
  /** Request header that carries the cursor to resume from. */
  resumeHeader: string;
  /** The `event:` name of the frame that says the cursor is gone. */
  resetEvent: string;
  timing: StreamTiming;
  limits: StreamLimits;
  refusals: readonly StreamRefusal[];
}

/** Why a stream ended for good. Everything else is retried and never an error. */
export type StreamErrorKind =
  | "unauthorized"
  | "forbidden"
  | "invalid_request"
  | "not_found"
  | "refused"
  | "unexpected_response"
  | "gave_up";

/**
 * A terminal stream failure: the stream has stopped and will not reconnect.
 * `kind` says why; `status`, `code` and `message` are the API's when it
 * answered (`status` is 0 for `gave_up`).
 */
export class StreamError extends WuapiError {
  readonly kind: StreamErrorKind;

  constructor(init: { kind: StreamErrorKind; status: number; code: string; message: string; retryAfter?: number | undefined }) {
    super(init);
    this.name = "StreamError";
    this.kind = init.kind;
  }
}

/** Something a stream reports, in the order it happens. */
export type StreamItem<E> =
  | { type: "open" }
  | {
      type: "event";
      /** The event: the same envelope a webhook carries. */
      event: E;
      /** The frame's `event:` field: the event type. */
      name: string;
      /** The envelope's `id` (`evt_...`), stable across replays. */
      id: string | undefined;
      /** The cursor after this event: pass it as `lastEventId` to resume here. */
      cursor: string | undefined;
      /** The frame's `data:`, exactly as received. */
      data: string;
    }
  | {
      /** The cursor could not be resumed: events may have been missed. Resync over REST; the stream goes on live. */
      type: "reset";
      reason: string;
    }
  | {
      /** A frame was dropped. */
      type: "skipped";
      reason: "oversized" | "invalid_data";
      name: string | undefined;
    }
  | {
      /** Not connected; the next connect starts in `delayMs`. */
      type: "reconnecting";
      /** `ended`: the server closed. `cut`: reading failed. `idle`: silence. `unreachable`: no answer. `refused`: an answer that is retried. */
      reason: "ended" | "cut" | "idle" | "unreachable" | "refused";
      delayMs: number;
      /** Consecutive failures so far. */
      failures: number;
      /** The HTTP status, when `reason` is `refused`. */
      status?: number;
      /** The API's error code, when `reason` is `refused` and the body had one. */
      code?: string;
      /** What went wrong, for a log. Never the key. */
      message?: string;
    };

/** Every item but an event. */
export type StreamStatus = Exclude<StreamItem<never>, { type: "event" }>;

/** Where a stream is: `connecting`, `open`, `waiting` to connect again, or `closed`. */
export type StreamState = "connecting" | "open" | "waiting" | "closed";

export interface StreamOptions {
  /** Ends the stream. The iteration finishes without an error. */
  signal?: AbortSignal;
  /** Called for every item that is not an event: `open`, `reset`, `skipped`, `reconnecting`. */
  onStatus?: (status: StreamStatus) => void;
  /** Event ids remembered to drop a replay's repeats. 0 delivers every frame. Defaults to the stream's own. */
  dedupeWindow?: number;
  /** Largest frame accepted, in bytes. Defaults to the stream's own. */
  maxFrameBytes?: number;
  /** Stop with a `gave_up` error after this long without an open connection. Off by default: the stream retries for ever. */
  giveUpAfterMs?: number;
}

/** What a stream is opened with. */
export interface StreamInit {
  /** Query parameter to values: each is sent comma-joined, and left out when empty. */
  filters?: Record<string, readonly string[] | undefined>;
  /** The cursor to resume from. */
  lastEventId?: string | undefined;
}

/** The clock and the random number, replaceable so tests script both. */
export interface StreamRuntime {
  now(): number;
  /** Resolves after `ms`, or as soon as `signal` aborts (it is not aborted yet when this is called). Never rejects. */
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  /** A number in `[0, 1)`. */
  random(): number;
}

const REAL: StreamRuntime = {
  now: () => Date.now(),
  random: () => Math.random(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      signal.addEventListener("abort", done, { once: true });
    }),
};

/** What the parser found in the bytes it was fed. */
export type SseItem =
  | { kind: "event"; event: string; data: string; id: string | undefined }
  /** A block with an id and no data. */
  | { kind: "cursor"; id: string }
  | { kind: "retry"; ms: number }
  | { kind: "comment" }
  /** A frame over the cap was dropped. */
  | { kind: "oversized" };

const BOM = [0xef, 0xbb, 0xbf];
const LF = 0x0a;
const CR = 0x0d;

/**
 * Incremental parser of the event stream format. It splits on bytes and
 * decodes one complete line at a time, so a chunk may cut a line, a CRLF or a
 * character anywhere: the result is the same for every split. A half-read
 * frame is never dispatched.
 */
export class SseParser {
  readonly #maxFrame: number;
  // A byte order mark inside the stream is a character like any other.
  readonly #decoder = new TextDecoder("utf-8", { ignoreBOM: true });
  /** The first bytes, while they could still be a byte order mark. */
  #head: number[] | undefined = [];
  #line: number[] = [];
  /** The line outgrew the cap: its bytes are skipped to its end. */
  #lineOverflow = false;
  /** A CR ended the last line: an LF right after it is the same line end. */
  #pendingCr = false;
  #event = "";
  #data = "";
  #hasData = false;
  #id: string | undefined;
  #frameBytes = 0;
  #poisoned = false;

  /** A parser that drops frames and lines over `maxFrameBytes`. */
  constructor(maxFrameBytes: number) {
    this.#maxFrame = maxFrameBytes;
  }

  /** Takes the next bytes and returns what they completed. */
  feed(chunk: Uint8Array): SseItem[] {
    const items: SseItem[] = [];
    for (const byte of chunk) {
      if (!this.#head) {
        this.#byte(byte, items);
        continue;
      }
      this.#head.push(byte);
      if (BOM[this.#head.length - 1] !== byte) {
        const held = this.#head;
        this.#head = undefined;
        for (const b of held) this.#byte(b, items);
      } else if (this.#head.length === BOM.length) {
        this.#head = undefined;
      }
    }
    return items;
  }

  #byte(byte: number, items: SseItem[]): void {
    const afterCr = this.#pendingCr;
    this.#pendingCr = false;
    if (afterCr && byte === LF) return;
    if (byte === LF || byte === CR) {
      this.#pendingCr = byte === CR;
      this.#endLine(items);
    } else if (!this.#lineOverflow) {
      this.#line.push(byte);
      if (this.#line.length > this.#maxFrame) {
        this.#line = [];
        this.#lineOverflow = true;
      }
    }
  }

  #endLine(items: SseItem[]): void {
    const bytes = this.#line;
    this.#line = [];
    if (this.#lineOverflow) {
      this.#lineOverflow = false;
      this.#poison();
      return;
    }
    if (bytes.length === 0) {
      this.#dispatch(items);
      return;
    }
    this.#frameBytes += bytes.length + 1;
    if (this.#frameBytes > this.#maxFrame) this.#poison();
    const line = this.#decoder.decode(Uint8Array.from(bytes));
    if (line.startsWith(":")) {
      items.push({ kind: "comment" });
      return;
    }
    const colon = line.indexOf(":");
    if (colon === -1) return;
    const name = line.slice(0, colon);
    const rest = line.slice(colon + 1);
    const value = rest.startsWith(" ") ? rest.slice(1) : rest;
    if (name === "id") {
      // Even a dropped frame has its id honoured, so the cursor moves past it.
      if (!value.includes("\u0000")) this.#id = value;
    } else if (name === "retry") {
      if (/^\d+$/.test(value)) items.push({ kind: "retry", ms: Number(value) });
    } else if (this.#poisoned) {
      // The frame's content is gone already.
    } else if (name === "event") {
      this.#event = value;
    } else if (name === "data") {
      this.#data = this.#hasData ? `${this.#data}\n${value}` : value;
      this.#hasData = true;
    }
  }

  /** The frame is over the cap: its content goes, its id stays. */
  #poison(): void {
    this.#poisoned = true;
    this.#event = "";
    this.#data = "";
    this.#hasData = false;
  }

  /** A blank line: the block is complete. */
  #dispatch(items: SseItem[]): void {
    const event = this.#event;
    const data = this.#data;
    const id = this.#id;
    const hasData = this.#hasData;
    const poisoned = this.#poisoned;
    this.#event = "";
    this.#data = "";
    this.#id = undefined;
    this.#hasData = false;
    this.#poisoned = false;
    this.#frameBytes = 0;
    if (poisoned) items.push({ kind: "oversized" });
    else if (hasData) {
      items.push({ kind: "event", event: event || "message", data, id });
      return;
    }
    if (id !== undefined) items.push({ kind: "cursor", id });
  }
}

/** How many connects a rolling window allows, over every stream of one client. */
class ConnectBudget {
  #starts: number[] = [];

  constructor(
    readonly limit: number,
    readonly windowMs: number,
  ) {}

  /**
   * Books the earliest start at or after `at` that keeps every window within
   * the limit, and returns it. Booked at once, so streams that plan at the
   * same instant do not all take the same slot.
   */
  reserve(now: number, at: number): number {
    this.#starts = this.#starts.filter((start) => now - start < this.windowMs);
    let slot = at;
    for (;;) {
      const near = this.#starts.filter((start) => Math.abs(slot - start) < this.windowMs).sort((a, b) => a - b);
      if (near.length < this.limit) break;
      // The start that frees a slot is the one `limit` back.
      slot = near[near.length - this.limit]! + this.windowMs;
    }
    this.#starts.push(slot);
    return slot;
  }
}

const BUDGETS = new WeakMap<HttpClient, ConnectBudget>();

/** How much of a refusal's body is read: an error body is a few hundred bytes. */
const REFUSED_BODY_MAX = 64 * 1024;

/** The body of an answer that is not the stream, capped. */
async function refusedBody(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  // What is left of a longer body goes with the connection, which the
  // caller closes.
  while (size < REFUSED_BODY_MAX) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

/** The API's error, when the body is one: a JSON object with a string `code` and `message`. */
function apiError(body: string): { code: string; message: string } | undefined {
  try {
    const parsed = JSON.parse(body) as { code?: unknown; message?: unknown } | null;
    if (parsed && typeof parsed.code === "string" && typeof parsed.message === "string") {
      return { code: parsed.code, message: parsed.message };
    }
  } catch {
    // Not JSON: not the API's.
  }
  return undefined;
}

/** The `reason` of a reset frame's data. */
function resetReason(data: string): string {
  try {
    const reason = (JSON.parse(data) as { reason?: unknown } | null)?.reason;
    if (typeof reason === "string") return reason;
  } catch {
    // No reason given.
  }
  return "unknown";
}

/** The key travels to this URL: https anywhere, http only on this machine, and nothing but a host. */
function checkStreamUrl(base: string): void {
  let url: URL | undefined;
  try {
    url = new URL(base);
  } catch {
    // Reported below.
  }
  const loopback = url !== undefined && (url.hostname === "localhost" || url.hostname === "[::1]" || /^127(\.\d{1,3}){3}$/.test(url.hostname));
  const scheme = url?.protocol === "https:" || (url?.protocol === "http:" && loopback);
  if (!url || !scheme || url.username || url.password || url.search || url.hash) {
    throw new Error(
      "wuapi: the stream URL must be https (http only on localhost), without credentials, query or fragment: the API key goes in its Authorization header.",
    );
  }
}

type Answer =
  | { kind: "stream"; reader: ReadableStreamDefaultReader<Uint8Array> }
  | { kind: "refused"; status: number; retryAfter: number | undefined; body: string }
  | { kind: "unreachable"; message: string }
  | { kind: "closed" };

/** How a connection ended. */
type End = { kind: "ended" | "idle" } | { kind: "cut"; message: string };

type Chunk = { kind: "bytes"; bytes: Uint8Array } | { kind: "closed" } | End;

const describe = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

/**
 * An open event stream. Iterate it for the events; it connects, reads,
 * reconnects with its cursor and waits between connects by itself, and ends
 * only when it is closed or on a terminal `StreamError`.
 *
 * ```ts
 * for await (const event of client.events.stream({ types: ["message.received"] })) {
 *   console.log(event.data.object.text);
 * }
 * ```
 *
 * A stream is iterated once, with `for await` (events) or `items()` (events
 * and everything else it reports).
 */
export class EventStream<E = unknown> implements AsyncIterable<E> {
  readonly #http: HttpClient;
  readonly #spec: StreamSpec;
  readonly #url: string;
  readonly #options: StreamOptions;
  readonly #runtime: StreamRuntime;
  readonly #budget: ConnectBudget;
  /** Aborted by `close()` and by the caller's signal. */
  readonly #stop = new AbortController();
  readonly #seen = new Set<string>();
  /** The connection being opened or read. */
  #conn: AbortController | undefined;
  #cursor: string | undefined;
  #retryMs: number;
  #failures = 0;
  #state: StreamState = "connecting";
  /** Since when no connection is open; undefined while one is. */
  #downSince: number | undefined;
  #started = false;

  constructor(http: HttpClient, spec: StreamSpec, init: StreamInit = {}, options: StreamOptions = {}, runtime: StreamRuntime = REAL) {
    this.#http = http;
    this.#spec = spec;
    this.#options = options;
    this.#runtime = runtime;
    this.#cursor = init.lastEventId || undefined;
    this.#retryMs = spec.timing.retryMs;

    // The key is never sent to the production stream host by a client that
    // was pointed at another API.
    const base = http.streamBaseUrl ?? (http.baseUrl === DEFAULT_BASE_URL ? spec.baseUrl : new URL(http.baseUrl).origin);
    checkStreamUrl(base);
    const url = new URL(base.replace(/\/+$/, "") + spec.path);
    for (const [name, values] of Object.entries(init.filters ?? {})) {
      if (values?.length) url.searchParams.set(name, values.join(","));
    }
    this.#url = url.toString();

    let budget = BUDGETS.get(http);
    if (!budget) {
      budget = new ConnectBudget(spec.limits.connectBudget, spec.limits.connectBudgetWindowMs);
      BUDGETS.set(http, budget);
    }
    this.#budget = budget;

    this.#stop.signal.addEventListener("abort", () => this.#conn?.abort(), { once: true });
    const signal = options.signal;
    if (signal?.aborted) this.#stop.abort();
    else signal?.addEventListener("abort", () => this.#stop.abort(), { once: true });
  }

  /** The cursor of the last frame read: pass it as `lastEventId` to a new stream to resume from here. */
  get lastEventId(): string | undefined {
    return this.#cursor;
  }

  get state(): StreamState {
    return this.#state;
  }

  /** Ends the stream: the iteration finishes without an error, and no connect starts afterwards. */
  close(): void {
    this.#stop.abort();
  }

  /** The events, typed. Everything else the stream reports goes to `onStatus`. */
  async *[Symbol.asyncIterator](): AsyncGenerator<E, void, undefined> {
    for await (const item of this.items()) {
      if (item.type === "event") yield item.event;
    }
  }

  /** Everything the stream reports, in order: events, and `open`, `reset`, `skipped` and `reconnecting`. */
  async *items(): AsyncGenerator<StreamItem<E>, void, undefined> {
    if (this.#started) throw new Error("wuapi: a stream can be iterated only once.");
    this.#started = true;
    const rt = this.#runtime;
    const timing = this.#spec.timing;
    this.#downSince = rt.now();
    let at = this.#budget.reserve(rt.now(), rt.now());
    try {
      for (;;) {
        if (!(await this.#sleepUntil(at))) return;
        this.#state = "connecting";
        const answer = await this.#connect();
        if (answer.kind === "closed") return;
        if (answer.kind !== "stream") {
          this.#failures += 1;
          const item = answer.kind === "refused" ? this.#refused(answer) : this.#reconnecting({ reason: "unreachable", message: answer.message });
          at = rt.now() + item.delayMs;
          yield this.#report(item);
          continue;
        }

        this.#state = "open";
        this.#downSince = undefined;
        const since = rt.now();
        yield this.#report({ type: "open" });
        const parser = new SseParser(this.#options.maxFrameBytes ?? this.#spec.limits.maxFrameBytes);
        let end: End;
        for (;;) {
          const chunk = await this.#read(answer.reader);
          if (chunk.kind === "closed") return;
          if (chunk.kind !== "bytes") {
            end = chunk;
            break;
          }
          for (const found of parser.feed(chunk.bytes)) {
            const item = this.#take(found);
            if (item) yield this.#report(item);
            // Closed between two frames of one chunk: the rest is not delivered.
            if (this.#stop.signal.aborted) return;
          }
        }
        this.#conn?.abort();
        this.#downSince = rt.now();
        this.#failures = rt.now() - since >= timing.stableAfterMs ? 0 : this.#failures + 1;
        const item = this.#reconnecting({ reason: end.kind, ...(end.kind === "cut" ? { message: end.message } : {}) });
        at = rt.now() + item.delayMs;
        yield this.#report(item);
      }
    } finally {
      this.#state = "closed";
      this.#stop.abort();
    }
  }

  #report(item: StreamItem<E>): StreamItem<E> {
    if (item.type !== "event") this.#options.onStatus?.(item);
    return item;
  }

  /** The instant the stream gives up at, when it has a give-up time and no open connection. */
  #giveUpAt(): number | undefined {
    const after = this.#options.giveUpAfterMs;
    return after !== undefined && this.#downSince !== undefined ? this.#downSince + after : undefined;
  }

  #gaveUp(): StreamError {
    return new StreamError({ kind: "gave_up", status: 0, code: "gave_up", message: "The stream could not be opened for the give-up time." });
  }

  /** Waits until `at`. False when the stream was closed meanwhile; throws at the give-up time. */
  async #sleepUntil(at: number): Promise<boolean> {
    for (;;) {
      if (this.#stop.signal.aborted) return false;
      const now = this.#runtime.now();
      const limit = this.#giveUpAt();
      if (limit !== undefined && now >= limit) throw this.#gaveUp();
      if (now >= at) return true;
      this.#state = "waiting";
      await this.#runtime.sleep(Math.min(at, limit ?? at) - now, this.#stop.signal);
    }
  }

  /** One connect, bounded up to the headers and a refusal's small body. */
  async #connect(): Promise<Answer> {
    const conn = new AbortController();
    this.#conn = conn;
    const headers: Record<string, string> = { Accept: "text/event-stream", "Cache-Control": "no-cache" };
    if (this.#cursor !== undefined) headers[this.#spec.resumeHeader] = this.#cursor;
    const open = async (): Promise<Answer> => {
      const response = await this.#http.openStream(this.#url, headers, conn.signal);
      const type = response.headers.get("content-type") ?? "";
      if (response.status === 200 && response.body && type.trim().toLowerCase().startsWith("text/event-stream")) {
        return { kind: "stream", reader: response.body.getReader() };
      }
      const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
      return { kind: "refused", status: response.status, retryAfter, body: await refusedBody(response) };
    };
    const limit = this.#giveUpAt();
    const bound = Math.min(this.#spec.timing.openTimeoutMs, limit === undefined ? Infinity : limit - this.#runtime.now());
    const timer = new AbortController();
    const first = await Promise.race([
      open().then(
        (answer) => answer,
        (cause: unknown): Answer => ({ kind: "unreachable", message: describe(cause) }),
      ),
      this.#runtime.sleep(bound, timer.signal).then(() => undefined),
    ]);
    timer.abort();
    if (this.#stop.signal.aborted) return { kind: "closed" };
    if (first) {
      if (first.kind !== "stream") conn.abort();
      return first;
    }
    conn.abort();
    if (limit !== undefined && this.#runtime.now() >= limit) throw this.#gaveUp();
    return { kind: "unreachable", message: "The connection took too long." };
  }

  /** The next bytes of an open stream, or how it ended. */
  async #read(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Chunk> {
    const timer = new AbortController();
    const got = await Promise.race([
      reader.read().then(
        (result): Chunk => (result.done ? { kind: "ended" } : { kind: "bytes", bytes: result.value }),
        (cause: unknown): Chunk => ({ kind: "cut", message: describe(cause) }),
      ),
      this.#runtime.sleep(this.#spec.timing.idleTimeoutMs, timer.signal).then((): Chunk => ({ kind: "idle" })),
    ]);
    timer.abort();
    return this.#stop.signal.aborted ? { kind: "closed" } : got;
  }

  /** What one answer that is not the stream comes to: a terminal error, thrown, or a wait. */
  #refused(answer: Extract<Answer, { kind: "refused" }>): Extract<StreamItem<E>, { type: "reconnecting" }> {
    const { status } = answer;
    const api = apiError(answer.body);
    const entries = this.#spec.refusals.filter((r) => r.status === status);
    const entry = entries.find((r) => r.code !== undefined && r.code === api?.code) ?? entries.find((r) => r.code === undefined);
    let kind: StreamErrorKind | undefined;
    if (status === 200) kind = "unexpected_response";
    else if (entry?.error) kind = !entry.apiOnly || api ? entry.error : undefined;
    else if (!(status === 408 || status === 429 || status >= 500)) kind = "refused";
    if (kind) {
      throw new StreamError({
        kind,
        status,
        code: api?.code ?? `http_${status}`,
        message: api?.message ?? `The stream answered ${status}.`,
        retryAfter: answer.retryAfter,
      });
    }
    const asked = answer.retryAfter !== undefined ? answer.retryAfter * 1000 : entry?.waitMs;
    return this.#reconnecting(
      { reason: "refused", status, ...(api ? { code: api.code, message: api.message } : {}) },
      asked,
    );
  }

  /** Plans the next connect (CONTRACT.md §5) and says so. */
  #reconnecting(
    why: Pick<Extract<StreamItem<E>, { type: "reconnecting" }>, "reason" | "status" | "code" | "message">,
    asked = 0,
  ): Extract<StreamItem<E>, { type: "reconnecting" }> {
    const timing = this.#spec.timing;
    const floor = Math.max(Math.min(this.#retryMs, timing.retryMaxMs), Math.min(asked, timing.retryAfterMaxMs));
    const step = Math.min(timing.backoffCapMs, timing.backoffBaseMs * 2 ** (Math.max(this.#failures, 1) - 1));
    const delay = Math.max(timing.minGapMs, Math.trunc(floor + this.#runtime.random() * step));
    const now = this.#runtime.now();
    this.#state = "waiting";
    return { type: "reconnecting", ...why, delayMs: this.#budget.reserve(now, now + delay) - now, failures: this.#failures };
  }

  /** An empty id clears the cursor, as the format says. */
  #setCursor(id: string | undefined): void {
    if (id !== undefined) this.#cursor = id === "" ? undefined : id;
  }

  /** What one parsed item is to the caller, if anything. */
  #take(found: SseItem): StreamItem<E> | undefined {
    switch (found.kind) {
      case "comment":
        return undefined;
      case "retry":
        this.#retryMs = found.ms;
        return undefined;
      case "cursor":
        this.#setCursor(found.id);
        return undefined;
      case "oversized":
        return { type: "skipped", reason: "oversized", name: undefined };
      case "event":
        break;
    }
    if (found.event === this.#spec.resetEvent) {
      this.#cursor = undefined;
      return { type: "reset", reason: resetReason(found.data) };
    }
    this.#setCursor(found.id);
    let envelope: unknown;
    try {
      envelope = JSON.parse(found.data);
    } catch {
      // Reported below.
    }
    if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) {
      return { type: "skipped", reason: "invalid_data", name: found.event };
    }
    const raw = (envelope as { id?: unknown }).id;
    const id = typeof raw === "string" ? raw : undefined;
    const window = this.#options.dedupeWindow ?? this.#spec.limits.dedupeWindow;
    if (id !== undefined && window > 0) {
      if (this.#seen.has(id)) return undefined;
      this.#seen.add(id);
      if (this.#seen.size > window) this.#seen.delete(this.#seen.values().next().value as string);
    }
    return { type: "event", event: envelope as E, name: found.event, id, cursor: this.#cursor, data: found.data };
  }
}
