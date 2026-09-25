// Type-level tests: `bun run typecheck` compiles this file, so every
// `@ts-expect-error` below must still be an error. The runtime assertions only
// keep vitest from reporting an empty file.
import { describe, expect, expectTypeOf, it } from "vitest";
import type { Account, AccountCreateParams, AccountUpdateParams, HistorySyncSetting, InvitationCreateParams, SendMessageParams, SendType, StoryCreateParams } from "../src/index.js";

const base = { accountId: "acc_1", to: "+584241112233" };

describe("SendMessageParams", () => {
  it("is discriminated by type", () => {
    const sends: SendMessageParams[] = [
      { ...base, text: "hi" },
      { ...base, type: "text", text: "hi", linkPreview: { url: "https://example.com", title: "Example" } },
      { ...base, type: "image", media: { url: "https://example.com/a.jpg" }, text: "caption", viewOnce: true },
      { ...base, type: "video", media: { url: "https://example.com/a.mp4", gifPlayback: true } },
      { ...base, type: "voice", media: { url: "https://example.com/a.ogg" } },
      { ...base, type: "document", media: { url: "https://example.com/a.pdf", filename: "a.pdf" } },
      { ...base, type: "location", location: { latitude: 10.5, longitude: -66.9 } },
      { ...base, type: "contact", contact: { name: "Sales", phone: "+584121111111" } },
      { ...base, type: "poll", poll: { name: "Lunch?", options: ["Pizza", "Sushi"] } },
      { ...base, type: "calendar_event", calendarEvent: { name: "Review", startsAt: "2026-10-01T15:00:00Z" } },
    ];
    expect(sends).toHaveLength(10);

    // @ts-expect-error text is required for text messages
    const noText: SendMessageParams = { ...base };
    // @ts-expect-error media is required for media types
    const noMedia: SendMessageParams = { ...base, type: "image" };
    // @ts-expect-error poll is required for polls
    const noPoll: SendMessageParams = { ...base, type: "poll" };
    // @ts-expect-error gifPlayback is for videos only
    const gifImage: SendMessageParams = { ...base, type: "image", media: { url: "https://example.com/a.jpg", gifPlayback: true } };
    // @ts-expect-error viewOnce is not for documents
    const viewOnceDoc: SendMessageParams = { ...base, type: "document", media: { url: "https://example.com/a.pdf" }, viewOnce: true };
    expect([noText, noMedia, noPoll, gifImage, viewOnceDoc]).toHaveLength(5);
  });

  it("narrows on type", () => {
    const narrow = (p: SendMessageParams) => {
      if (p.type === "poll") expectTypeOf(p.poll.options).toEqualTypeOf<string[]>();
      if (p.type === undefined || p.type === "text") expectTypeOf(p.text).toEqualTypeOf<string>();
    };
    narrow({ ...base, text: "hi" });
    expectTypeOf<SendType>().toEqualTypeOf<
      "text" | "image" | "video" | "audio" | "voice" | "document" | "sticker" | "location" | "contact" | "contacts" | "poll" | "calendar_event"
    >();
  });
});

describe("StoryCreateParams", () => {
  it("is text or media", () => {
    const stories: StoryCreateParams[] = [
      { text: "Open until 18:00", backgroundColor: "#0F766E", font: 1 },
      { type: "image", media: { url: "https://example.com/promo.jpg" }, text: "This week only" },
    ];
    // @ts-expect-error media stories need media
    const noMedia: StoryCreateParams = { type: "video" };
    // @ts-expect-error text stories need text
    const noText: StoryCreateParams = { type: "text" };
    expect([...stories, noMedia, noText]).toHaveLength(4);
  });
});

describe("historySync", () => {
  it("is none or recent on create, update, the account and invitations", () => {
    expectTypeOf<HistorySyncSetting>().toEqualTypeOf<"none" | "recent">();
    expectTypeOf<Account["historySync"]>().toEqualTypeOf<HistorySyncSetting>();
    const create: AccountCreateParams = { proxyLocation: { country: "VE", city: "caracas" }, historySync: "recent" };
    const update: AccountUpdateParams = { historySync: "none" };
    const invite: InvitationCreateParams = { historySync: "recent" };
    // @ts-expect-error only none or recent
    const full: AccountUpdateParams = { historySync: "full" };
    expect([create, update, invite, full]).toHaveLength(4);
  });
});
