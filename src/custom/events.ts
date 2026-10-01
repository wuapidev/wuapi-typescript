// Hand-written: the event list in the backend's order, and helper types over
// the generated WebhookEvent. test/custom/events.test.ts checks the list
// against apps/wuapi/convex/lib/events.ts and against the spec's
// WebhookEventType.

import type { WebhookEvent, WebhookEventType } from "../types.js";

/** Every webhook event type, in the order the backend lists them. */
export const WEBHOOK_EVENT_TYPES = [
  "account.qr_code_issued",
  "account.pairing_code_issued",
  "account.connected",
  "account.disconnected",
  "account.failed",
  "message.received",
  "message.sent",
  "message.delivered",
  "message.read",
  "message.failed",
  "message.edited",
  "message.deleted",
  "message.media_downloaded",
  "poll.voted",
  "group.joined",
  "group.updated",
  "group.join_requested",
  "group.join_request_revoked",
  "chat.updated",
  "chat.presence_updated",
  "contact.presence_updated",
  "contact.picture_updated",
  "contact.updated",
  "blocklist.updated",
  "label.updated",
  "call.received",
  "call.ended",
  "channel.message_received",
  "channel.message_updated",
  "channel.updated",
  "history.synced",
  "project.created",
  "project.updated",
  "project.deleted",
  "invitation.status_changed",
  // Sent only by "Send test event" in the dashboard, to the endpoint being tested.
  "webhook.test",
] as const satisfies readonly WebhookEventType[];

/** The event of one type: `WebhookEventOf<"message.received">`. */
export type WebhookEventOf<T extends WebhookEventType> = Extract<WebhookEvent, { type: T }>;

/** What `data.object` is for each event type. */
export type EventObjectMap = { [T in WebhookEventType]: WebhookEventOf<T>["data"]["object"] };
