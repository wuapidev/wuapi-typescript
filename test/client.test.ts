import { afterEach, describe, expect, it, vi } from "vitest";
import { Wuapi, WuapiError } from "../src/index.js";
import { account, list, message, mockFetch } from "./helpers.js";

const KEY = "wu_live_" + "a".repeat(48);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("request building", () => {
  it("sends the bearer token, JSON body, idempotency header and base URL", async () => {
    const { fetch, calls } = mockFetch([{ status: 202, body: message("msg_1") }]);
    const client = new Wuapi({ apiKey: KEY, baseUrl: "https://example.test/", fetch });
    const sent = await client.messages.send({ accountId: "acc_1", to: "+584241112233", text: "hi" }, { idempotencyKey: "k1" });
    expect(sent.id).toBe("msg_1");
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe("https://example.test/v1/messages");
    expect(call.method).toBe("POST");
    expect(call.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(call.headers["Content-Type"]).toBe("application/json");
    expect(call.headers["Idempotency-Key"]).toBe("k1");
    expect(call.body).toEqual({ accountId: "acc_1", to: "+584241112233", text: "hi" });
  });

  it("defaults to api.wuapi.dev and generates an idempotency key for every POST only", async () => {
    const { fetch, calls } = mockFetch([
      { status: 202, body: message("msg_1") },
      { status: 202, body: account() },
      { status: 200, body: account() },
    ]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    await client.messages.send({ accountId: "acc_1", to: "+1", text: "x" });
    await client.accounts.reconnect("acc_1");
    await client.accounts.get("acc_1");
    expect(calls[0]!.url).toBe("https://api.wuapi.dev/v1/messages");
    expect(calls[0]!.headers["Idempotency-Key"]).toMatch(/.{8,}/);
    expect(calls[1]!.headers["Idempotency-Key"]).toMatch(/.{8,}/);
    expect(calls[1]!.headers["Idempotency-Key"]).not.toBe(calls[0]!.headers["Idempotency-Key"]);
    expect(calls[2]!.headers["Idempotency-Key"]).toBeUndefined();
    expect(calls[0]!.body).not.toHaveProperty("idempotencyKey");
  });

  it("keeps the same idempotency key across retries of one POST", async () => {
    vi.useFakeTimers();
    const { fetch, calls } = mockFetch([
      { status: 503, body: { code: "engine_unavailable", message: "Retry." } },
      { status: 202, body: message("msg_1") },
    ]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    const promise = client.messages.send({ accountId: "acc_1", to: "+1", text: "x" });
    await vi.runAllTimersAsync();
    await promise;
    expect(calls).toHaveLength(2);
    expect(calls[1]!.headers["Idempotency-Key"]).toBe(calls[0]!.headers["Idempotency-Key"]);
  });

  it("reads WUAPI_API_KEY from the environment", async () => {
    vi.stubEnv("WUAPI_API_KEY", KEY);
    const { fetch, calls } = mockFetch([
      { status: 200, body: { object: "auth_context", organization: { object: "organization", id: "w", name: "W" }, apiKey: { id: "k" }, project: null } },
    ]);
    const me = await new Wuapi({ fetch }).me();
    expect(me.organization.id).toBe("w");
    expect(calls[0]!.headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  it("throws without an API key", () => {
    vi.stubEnv("WUAPI_API_KEY", "");
    expect(() => new Wuapi({ fetch: mockFetch([]).fetch })).toThrow(/missing API key/);
  });

  it("encodes query parameters and path segments", async () => {
    const { fetch, calls } = mockFetch([
      { status: 204 },
      { status: 200, body: { object: "group_invite_link", groupId: "123@g.us", url: "https://chat.whatsapp.com/x" } },
      { status: 200, body: list([]) },
    ]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    await client.messages.delete("msg_1", { forEveryone: false });
    const link = await client.groups.resetInviteLink("acc_1", "123@g.us");
    await client.messages.list({ accountId: "acc_1", direction: "inbound", limit: 10 }).page();
    expect(calls[0]!.url).toBe("https://api.wuapi.dev/v1/messages/msg_1?forEveryone=false");
    expect(calls[0]!.method).toBe("DELETE");
    expect(link.url).toBe("https://chat.whatsapp.com/x");
    expect(calls[1]!.url).toBe("https://api.wuapi.dev/v1/accounts/acc_1/groups/123%40g.us/invite-link/reset");
    expect(calls[2]!.url).toBe("https://api.wuapi.dev/v1/messages?accountId=acc_1&direction=inbound&limit=10");
  });

  it("returns resources as they come, and batch lists as arrays", async () => {
    const { fetch } = mockFetch([
      { status: 201, body: account() },
      { status: 200, body: list([{ object: "group", id: "g@g.us" }]) },
      { status: 200, body: { object: "webhook_endpoint", id: "whk_1", secret: "whsec_new" } },
      { status: 200, body: list([{ object: "contact_check", phone: "+1", onWhatsApp: true }]) },
    ]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    expect((await client.accounts.create({ proxyLocation: { country: "VE", city: "caracas" }, name: "a" })).object).toBe("account");
    expect(await client.groups.list("acc_1").toArray()).toEqual([{ object: "group", id: "g@g.us" }]);
    expect((await client.webhookEndpoints.rotateSecret("whk_1")).secret).toBe("whsec_new");
    expect(await client.contacts.check("acc_1", ["+1"])).toEqual([{ object: "contact_check", phone: "+1", onWhatsApp: true }]);
  });
});

describe("errors", () => {
  it("maps the error body, status and request id", async () => {
    const { fetch } = mockFetch([
      {
        status: 402,
        body: {
          code: "subscription_required",
          message: "Start a subscription to connect accounts.",
          details: { billingUrl: "https://wuapi.dev/app/billing" },
        },
        headers: { "x-request-id": "req_123" },
      },
    ]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    const err = await client.accounts.create({ proxyLocation: { country: "VE", city: "caracas" } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WuapiError);
    const e = err as WuapiError;
    expect(e.status).toBe(402);
    expect(e.code).toBe("subscription_required");
    expect(e.message).toBe("Start a subscription to connect accounts.");
    expect(e.details).toEqual({ billingUrl: "https://wuapi.dev/app/billing" });
    expect(e.requestId).toBe("req_123");
  });

  it("falls back to a generic code for non-JSON bodies", async () => {
    const fetch = async () => new Response("<html>bad gateway</html>", { status: 400 });
    const client = new Wuapi({ apiKey: KEY, fetch, maxRetries: 0 });
    const e = (await client.me().catch((x: unknown) => x)) as WuapiError;
    expect(e.status).toBe(400);
    expect(e.code).toBe("http_400");
  });

  it("does not retry 409 account_not_ready", async () => {
    const { fetch, calls } = mockFetch([
      { status: 409, body: { code: "account_not_ready", message: "Not connected." } },
    ]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    await expect(client.messages.send({ accountId: "acc_1", to: "+1", text: "x" })).rejects.toMatchObject({
      status: 409,
      code: "account_not_ready",
    });
    expect(calls).toHaveLength(1);
  });
});

describe("retries", () => {
  it("retries 429 honoring Retry-After", async () => {
    vi.useFakeTimers();
    const { fetch, calls } = mockFetch([
      { status: 429, body: { code: "rate_limited", message: "Slow down." }, headers: { "Retry-After": "3" } },
      { status: 201, body: account() },
    ]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    const promise = client.accounts.create({ proxyLocation: { country: "VE", city: "caracas" } });
    await vi.advanceTimersByTimeAsync(2_900);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200);
    const created = await promise;
    expect(created.id).toBe("acc_1");
    expect(calls).toHaveLength(2);
  });

  it("gives up after maxRetries and throws the last error", async () => {
    const reply = { status: 429, body: { code: "rate_limited", message: "Slow down." }, headers: { "Retry-After": "0" } };
    const { fetch, calls } = mockFetch([reply, reply, reply]);
    const client = new Wuapi({ apiKey: KEY, fetch, maxRetries: 2 });
    await expect(client.me()).rejects.toMatchObject({ status: 429, code: "rate_limited", retryAfter: 0 });
    expect(calls).toHaveLength(3);
  });

  it("retries 5xx and network errors on idempotent requests", async () => {
    vi.useFakeTimers();
    const { fetch, calls } = mockFetch([
      { status: 503, body: { code: "internal_error", message: "Try again." } },
      new TypeError("fetch failed"),
      { status: 200, body: account({ status: "ready" }) },
    ]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    const promise = client.accounts.get("acc_1");
    await vi.runAllTimersAsync();
    expect((await promise).status).toBe("ready");
    expect(calls).toHaveLength(3);
  });

  it("retries 5xx on creates too, because every POST carries an idempotency key", async () => {
    vi.useFakeTimers();
    const { fetch, calls } = mockFetch([
      { status: 500, body: { code: "internal_error", message: "Boom." } },
      { status: 201, body: { object: "webhook_endpoint", id: "whk_1", secret: "whsec_x" } },
    ]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    const promise = client.webhookEndpoints.create({ url: "https://x.test", events: ["message.received"] });
    await vi.runAllTimersAsync();
    expect((await promise).id).toBe("whk_1");
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe("https://api.wuapi.dev/v1/webhook-endpoints");
  });
});

describe("pagination", () => {
  it("iterates every item across pages", async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: list([message("m1"), message("m2")], "c2") },
      { status: 200, body: list([message("m3")]) },
    ]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    const ids: string[] = [];
    for await (const m of client.messages.list({ accountId: "acc_1", limit: 2 })) ids.push(m.id);
    expect(ids).toEqual(["m1", "m2", "m3"]);
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.wuapi.dev/v1/messages?accountId=acc_1&limit=2",
      "https://api.wuapi.dev/v1/messages?accountId=acc_1&limit=2&cursor=c2",
    ]);
  });

  it("exposes single pages and toArray with a cap", async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: list([account({ id: "a1" })], "c2") },
      { status: 200, body: list([account({ id: "a1" }), account({ id: "a2" })], "c2") },
    ]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    const page = await client.accounts.list().page();
    expect(page.nextCursor).toBe("c2");
    expect(page.items).toHaveLength(1);
    const two = await client.accounts.list({ limit: 2 }).toArray(1);
    expect(two.map((a) => a.id)).toEqual(["a1"]);
    expect(calls).toHaveLength(2);
  });
});

describe("account wait helpers", () => {
  it("waitUntilReady reports each new QR and resolves on ready", async () => {
    const { fetch } = mockFetch([
      { status: 200, body: account() },
      { status: 200, body: account({ status: "qr_ready", qrCodeUrl: "data:image/png;base64,A" }) },
      { status: 200, body: account({ status: "qr_ready", qrCodeUrl: "data:image/png;base64,A" }) },
      { status: 200, body: account({ status: "qr_ready", qrCodeUrl: "data:image/png;base64,B" }) },
      { status: 200, body: account({ status: "ready", phone: "+584121234567" }) },
    ]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    const qrs: string[] = [];
    const ready = await client.accounts.waitUntilReady("acc_1", { intervalMs: 1, onQrCode: (qr) => qrs.push(qr) });
    expect(ready.phone).toBe("+584121234567");
    expect(qrs).toEqual(["data:image/png;base64,A", "data:image/png;base64,B"]);
  });

  it("waitForQrCode returns the account once the QR code is available", async () => {
    const { fetch } = mockFetch([
      { status: 200, body: account() },
      { status: 200, body: account({ status: "qr_ready", qrCodeUrl: "data:image/png;base64,A" }) },
    ]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    const acc = await client.accounts.waitForQrCode("acc_1", { intervalMs: 1 });
    expect(acc.qrCodeUrl).toBe("data:image/png;base64,A");
  });

  it("throws when the account fails", async () => {
    const { fetch } = mockFetch([{ status: 200, body: account({ status: "failed", lastError: "boom" }) }]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    await expect(client.accounts.waitUntilReady("acc_1", { intervalMs: 1 })).rejects.toMatchObject({
      code: "account_failed",
    });
  });
});
