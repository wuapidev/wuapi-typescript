import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  WEBHOOK_EVENT_TYPES,
  type Account,
  type EventObjectMap,
  type Invitation,
  type InvitationStatus,
  type Message,
  type PollVote,
  type WebhookEvent,
  type WebhookEventType,
} from "../src/index.js";

// The backend's list, imported from the source of truth rather than copied.
// It exists only in the wuapi monorepo; the standalone SDK repository
// (wuapidev/wuapi-typescript) skips this one test.
const EVENTS_URL = new URL("../../../apps/wuapi/convex/lib/events.ts", import.meta.url);
const EVENTS_TS = EVENTS_URL.href;
const IN_MONOREPO = existsSync(fileURLToPath(EVENTS_URL));

type Of<T extends WebhookEventType> = Extract<WebhookEvent, { type: T }>;

describe("webhook event types", () => {
  it.skipIf(!IN_MONOREPO)("equal the backend's WEBHOOK_EVENTS, in order", async () => {
    const backend = (await import(EVENTS_TS)) as { WEBHOOK_EVENTS: readonly string[] };
    expect([...WEBHOOK_EVENT_TYPES]).toEqual([...backend.WEBHOOK_EVENTS]);
  });

  it("are resource.verb_past names, 34 of them, none twice", () => {
    expect(WEBHOOK_EVENT_TYPES).toHaveLength(34);
    expect(new Set(WEBHOOK_EVENT_TYPES).size).toBe(34);
    for (const t of WEBHOOK_EVENT_TYPES) expect(t).toMatch(/^[a-z_]+\.[a-z_]+$/);
    expect(WEBHOOK_EVENT_TYPES.join(" ")).not.toMatch(/newsletter|status\./);
  });

  it("type the envelope and data.object per event", () => {
    expectTypeOf<keyof EventObjectMap>().toEqualTypeOf<WebhookEventType>();
    expectTypeOf<WebhookEvent["type"]>().toEqualTypeOf<WebhookEventType>();
    expectTypeOf<WebhookEvent["object"]>().toEqualTypeOf<"event">();
    expectTypeOf<WebhookEvent["projectId"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Of<"message.received">["data"]["object"]>().toEqualTypeOf<Message>();
    expectTypeOf<Of<"account.connected">["data"]["object"]>().toEqualTypeOf<Account>();
    expectTypeOf<Of<"poll.voted">["data"]["object"]>().toEqualTypeOf<PollVote>();
    expectTypeOf<Of<"invitation.status_changed">["data"]["object"]>().toEqualTypeOf<Invitation>();
    expectTypeOf<Of<"invitation.status_changed">["data"]["previousAttributes"]["status"]>().toEqualTypeOf<InvitationStatus>();
    expectTypeOf<Of<"message.edited">["data"]["previousAttributes"]["text"]>().toEqualTypeOf<string | null>();
  });
});
