// Hand-written. Streams in this SDK against the backend that serves it: the
// description the generator read (packages/sdk-codegen/wuapi.sdk.toml,
// exported as STREAM_SPEC) must say what apps/wuapi/convex/lib/stream.ts and
// the gateway say, and `client.events.stream` must be typed by its filter.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  STREAM_SPEC,
  WEBHOOK_EVENT_TYPES,
  Wuapi,
  type EventStream,
  type StreamEventType,
  type StreamResetReason,
  type WebhookEvent,
  type WebhookEventOf,
} from "../../src/index.js";
import { KEY } from "../helpers.js";

// These exist only in the wuapi monorepo; the standalone SDK repository
// (wuapidev/wuapi-typescript) skips the tests that read them.
const STREAM_URL = new URL("../../../../apps/wuapi/convex/lib/stream.ts", import.meta.url);
const GATEWAY_URL = new URL("../../../stream-gateway/internal/contract/constants.go", import.meta.url);
const IN_MONOREPO = existsSync(fileURLToPath(STREAM_URL));

/** The event types a stream refuses: the ones `StreamEventType` leaves out. */
const REFUSED = ["chat.presence_updated", "contact.presence_updated", "webhook.test"] as const;

describe("the stream description", () => {
  it.skipIf(!IN_MONOREPO)("says what the backend's constants say", async () => {
    const backend = (await import(STREAM_URL.href)) as {
      STREAM_HOST: string;
      STREAM_PATH: string;
      STREAM_HEARTBEAT_SECONDS: number;
      STREAM_REPLAY_WINDOW_MS: number;
      STREAM_CAP_RETRY_AFTER_SEC: number;
      STREAM_PRESENCE_TYPES: ReadonlySet<string>;
    };
    expect(STREAM_SPEC.baseUrl).toBe(`https://${backend.STREAM_HOST}`);
    expect(STREAM_SPEC.path).toBe(backend.STREAM_PATH);
    expect(STREAM_SPEC.timing.heartbeatMs).toBe(backend.STREAM_HEARTBEAT_SECONDS * 1000);
    expect(STREAM_SPEC.timing.replayWindowMs).toBe(backend.STREAM_REPLAY_WINDOW_MS);
    // A connection is idle after three missed heartbeats.
    expect(STREAM_SPEC.timing.idleTimeoutMs).toBe(3 * backend.STREAM_HEARTBEAT_SECONDS * 1000);
    // What a refused connect waits when the answer names no time.
    const limit = STREAM_SPEC.refusals.find((r) => r.code === "stream_connection_limit");
    expect(limit).toEqual({ status: 429, code: "stream_connection_limit", waitMs: backend.STREAM_CAP_RETRY_AFTER_SEC * 1000 });
    // Presence events are never streamed, so a filter cannot name them.
    for (const type of backend.STREAM_PRESENCE_TYPES) expect(REFUSED).toContain(type);
  });

  it.skipIf(!IN_MONOREPO)("opens with the retry the gateway sends", () => {
    const gateway = readFileSync(GATEWAY_URL, "utf8");
    const retry = /\bRetryMs\s*=\s*([\d_]+)/.exec(gateway);
    expect(Number(retry?.[1]?.replaceAll("_", ""))).toBe(STREAM_SPEC.timing.retryMs);
  });

  it("retries what waiting fixes and stops on what it does not", () => {
    const terminal = STREAM_SPEC.refusals.filter((r) => r.error).map((r) => [r.status, r.error]);
    expect(terminal).toEqual([
      [400, "invalid_request"],
      [401, "unauthorized"],
      [403, "forbidden"],
      [404, "not_found"],
    ]);
    // A 401 page from a proxy in front of the stream signs nobody out.
    expect(STREAM_SPEC.refusals.find((r) => r.status === 401)?.apiOnly).toBe(true);
    expect(STREAM_SPEC.refusals.filter((r) => !r.error).every((r) => r.status === 429 && r.waitMs !== undefined)).toBe(true);
  });
});

describe("client.events.stream", () => {
  const client = new Wuapi({ apiKey: KEY, fetch: async () => new Response(null, { status: 401 }) });

  it("carries every event a stream can, typed", () => {
    const stream = client.events.stream();
    stream.close();
    type Streamed = typeof stream extends EventStream<infer E> ? E : never;
    expectTypeOf<Streamed>().toEqualTypeOf<WebhookEventOf<StreamEventType>>();
    expectTypeOf<Streamed["type"]>().toEqualTypeOf<StreamEventType>();
    // Everything a webhook carries, but the three types a stream never does.
    expectTypeOf<Exclude<WebhookEvent["type"], Streamed["type"]>>().toEqualTypeOf<(typeof REFUSED)[number]>();
    const streamable: readonly StreamEventType[] = WEBHOOK_EVENT_TYPES.filter(
      (type): type is StreamEventType => !(REFUSED as readonly string[]).includes(type),
    );
    expect(streamable).toHaveLength(WEBHOOK_EVENT_TYPES.length - REFUSED.length);
  });

  it("is narrowed by the types it is filtered to", () => {
    const messages = client.events.stream({ types: ["message.received", "message.sent"], accounts: ["acc_1"] });
    messages.close();
    type Streamed = typeof messages extends EventStream<infer E> ? E : never;
    expectTypeOf<Streamed>().toEqualTypeOf<WebhookEventOf<"message.received" | "message.sent">>();
    expectTypeOf<Streamed["data"]["object"]["chatId"]>().toBeString();
    // @ts-expect-error a presence event is not on Streams
    client.events.stream({ types: ["chat.presence_updated"] }).close();
    // @ts-expect-error not an event type
    client.events.stream({ types: ["message.exploded"] }).close();
  });

  it("names the reasons of a reset", () => {
    expectTypeOf<StreamResetReason>().toEqualTypeOf<"cursor_expired" | "cursor_unknown" | "not_logged">();
  });
});
