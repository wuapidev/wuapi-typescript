import type { FetchLike } from "../src/index.js";

export interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | Error;

/** A fetch that records calls and answers from a queue of replies. */
export function mockFetch(replies: Reply[]): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const queue = [...replies];
  const fetch: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: init.method ?? "GET",
      headers: { ...(init.headers as Record<string, string>) },
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const reply = queue.shift();
    if (!reply) throw new Error(`Unexpected request: ${init.method} ${url}`);
    if (reply instanceof Error) throw reply;
    const text = reply.body === undefined ? null : JSON.stringify(reply.body);
    return new Response(reply.status === 204 ? null : text, {
      status: reply.status,
      headers: { "content-type": "application/json", ...reply.headers },
    });
  };
  return { fetch, calls };
}

export const account = (overrides: Record<string, unknown> = {}) => ({
  object: "account",
  id: "acc_1",
  projectId: null,
  name: null,
  status: "initializing",
  phone: null,
  profileName: null,
  proxyLocation: { country: "VE", city: "caracas" },
  qrCodeUrl: null,
  pairingCode: null,
  pairingCodeExpiresAt: null,
  billable: false,
  disconnectReason: null,
  lastError: null,
  rejectCalls: false,
  rejectCallsMessage: null,
  pacing: {
    messagesPerMinute: 12,
    firstContactPerMinute: 5,
    typing: { enabled: true, minMs: 800, maxMs: 6000, charsPerSecond: 25 },
    queueTimeoutMinutes: 60,
    custom: false,
  },
  metadata: {},
  linkedAt: null,
  lastConnectedAt: null,
  createdAt: "2026-09-24T09:00:00.000Z",
  updatedAt: "2026-09-24T09:00:00.000Z",
  ...overrides,
});

export const message = (id: string) => ({
  object: "message",
  id,
  projectId: null,
  accountId: "acc_1",
  chatId: "+584241112233",
  chatType: "direct",
  direction: "outbound",
  source: "api",
  from: "+584121234567",
  to: "+584241112233",
  profileName: null,
  type: "text",
  text: "hi",
  media: null,
  location: null,
  contact: null,
  contacts: null,
  poll: null,
  calendarEvent: null,
  mentions: [],
  forwarded: false,
  viewOnce: false,
  starred: false,
  replyToMessageId: null,
  status: "queued",
  error: null,
  metadata: {},
  sentAt: null,
  editedAt: null,
  deletedAt: null,
  createdAt: "2026-09-24T09:00:00.000Z",
  updatedAt: "2026-09-24T09:00:00.000Z",
});

export const list = <T>(items: T[], nextCursor: string | null = null) => ({ object: "list", items, nextCursor });
