// Copied by wuapi-codegen from packages/sdk-codegen/templates/typescript/test/stream-conformance.test.ts. Do not edit here.

// The Streams conformance suite (packages/sdk-codegen/streams/): every
// scenario of test/stream-conformance/ played against this runtime, with a
// scripted server, virtual time and scripted random numbers. The same files
// run in every SDK the generator emits; a failure here is a runtime that
// breaks the contract, never a scenario to adjust.
import { describe, expect, it } from "vitest";
import { HttpClient, PROJECT_HEADER } from "../src/index.js";
import { EventStream, StreamError, type StreamItem } from "../src/stream.js";
import { KEY } from "./helpers.js";
import { STREAM_HOST, VirtualClock, scriptedFetch, settle, suiteSpec, suiteText, type ScriptedResponse } from "./stream-helpers.js";

interface Scenario {
  name: string;
  summary: string;
  params?: { types?: string[]; accounts?: string[]; last_event_id?: string };
  options?: { dedupe_window?: number; max_frame_bytes?: number; give_up_after_ms?: number };
  client?: { project?: string };
  random?: number[];
  connections: {
    at_ms?: number;
    request?: { headers?: Record<string, string | null>; query?: Record<string, string> };
    response: ScriptedResponse;
  }[];
  expect: Record<string, unknown>[];
}

const index = JSON.parse(suiteText("index.json")) as { scenarios: string[] };
const spec = suiteSpec();

/** An item in the words of the scenario files (CONTRACT.md §8). */
function reported(item: StreamItem<unknown>): Record<string, unknown> {
  switch (item.type) {
    case "open":
      return { type: "open" };
    case "event":
      return { type: "event", event: item.name, id: item.id ?? null, cursor: item.cursor ?? null, data: item.data };
    case "reset":
      return { type: "reset", reason: item.reason };
    case "skipped":
      return { type: "skipped", reason: item.reason, event: item.name ?? null };
    case "reconnecting":
      return {
        type: "reconnecting",
        reason: item.reason,
        delay_ms: item.delayMs,
        failures: item.failures,
        ...(item.reason === "refused" ? { status: item.status, code: item.code ?? null } : {}),
      };
  }
}

/** A terminal error in the words of the scenario files. This SDK's errors always carry a code: its placeholders are `null` there. */
function failed(error: unknown): Record<string, unknown> {
  if (!(error instanceof StreamError)) throw error;
  if (error.kind === "gave_up") return { type: "error", kind: error.kind, status: null, code: null };
  return { type: "error", kind: error.kind, status: error.status, code: error.code === `http_${error.status}` ? null : error.code };
}

async function play(scenario: Scenario): Promise<void> {
  const clock = new VirtualClock(scenario.random);
  const { fetch, seen } = scriptedFetch(clock, scenario.connections.map((c) => c.response));
  const http = new HttpClient({ apiKey: KEY, fetch, streamBaseUrl: STREAM_HOST, ...(scenario.client?.project ? { project: scenario.client.project } : {}) });
  const o = scenario.options ?? {};
  const stream = new EventStream<unknown>(
    http,
    spec,
    { filters: { types: scenario.params?.types, accounts: scenario.params?.accounts }, lastEventId: scenario.params?.last_event_id },
    {
      ...(o.dedupe_window !== undefined ? { dedupeWindow: o.dedupe_window } : {}),
      ...(o.max_frame_bytes !== undefined ? { maxFrameBytes: o.max_frame_bytes } : {}),
      ...(o.give_up_after_ms !== undefined ? { giveUpAfterMs: o.give_up_after_ms } : {}),
    },
    clock,
  );
  const items = stream.items();

  /** The next item, moving the clock only while nothing else can happen. */
  const next = async (): Promise<Record<string, unknown> | "done"> => {
    let result: Record<string, unknown> | "done" | undefined;
    void items.next().then(
      (r) => (result = r.done ? "done" : reported(r.value)),
      (error: unknown) => (result = failed(error)),
    );
    for (;;) {
      await settle();
      if (result) return result;
      if (clock.next() === undefined) throw new Error(`${scenario.name}: the client is waiting for nothing`);
      clock.step();
    }
  };

  const got: Record<string, unknown>[] = [];
  for (const wanted of scenario.expect) {
    const item = await next();
    if (item === "done") break;
    const at = { ...item, at_ms: clock.time };
    for (const optional of ["data", "at_ms"] as const) if (!(optional in wanted)) delete (at as Record<string, unknown>)[optional];
    got.push(at);
    if (item.type === "error") break;
  }
  expect(got).toEqual(scenario.expect);

  // Cancelled (or failed for good), the stream ends, stays silent and connects no more.
  stream.close();
  const until = clock.time + 120_000;
  for (let at = clock.next(); at !== undefined && at <= until; at = clock.next()) {
    clock.step();
    await settle();
  }
  expect(await next()).toBe("done");
  expect(stream.state).toBe("closed");

  expect(seen).toHaveLength(scenario.connections.length);
  scenario.connections.forEach((connection, n) => {
    const request = seen[n]!;
    const where = `${scenario.name}, connect ${n + 1}`;
    expect(request.method, where).toBe("GET");
    expect(request.url.origin + request.url.pathname, where).toBe(STREAM_HOST + spec.path);
    expect(request.headers.authorization, where).toBe(`Bearer ${KEY}`);
    expect(request.headers.accept, where).toBe("text/event-stream");
    expect(request.url.href, where).not.toContain(KEY);
    expect(request.redirect, where).toBe("manual");
    if (connection.at_ms !== undefined) expect(request.at, where).toBe(connection.at_ms);
    for (const [name, value] of Object.entries(connection.request?.headers ?? {})) {
      const header = name.replace("{project_header}", PROJECT_HEADER).toLowerCase();
      expect(request.headers[header] ?? null, `${where}, ${header}`).toBe(value);
    }
    if (connection.request?.query) expect(Object.fromEntries(request.url.searchParams), where).toEqual(connection.request.query);
  });
}

describe("Streams conformance", () => {
  it("has scenarios", () => {
    expect(index.scenarios.length).toBeGreaterThan(30);
  });

  for (const path of index.scenarios) {
    const scenario = JSON.parse(suiteText(path)) as Scenario;
    it(`${scenario.name}: ${scenario.summary}`, () => play(scenario));
  }
});
