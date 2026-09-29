// Copied by wuapi-codegen from packages/sdk-codegen/templates/typescript/test/runtime.test.ts. Do not edit here.

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import Client, {
  API_KEY_ENV,
  DEFAULT_BASE_URL,
  HttpClient,
  IDEMPOTENCY_HEADER,
  PACKAGE_NAME,
  Paginator,
  PROJECT_HEADER,
  VERSION,
  WuapiError,
  type CallOptions,
  type ClientOptions,
  type FetchLike,
  type Page,
} from "../src/index.js";
import { callOpts, randomKey } from "../src/core.js";
import { Resource } from "../src/resources/base.js";
import { KEY, mockFetch } from "./helpers.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const http = (fetch: FetchLike, extra: ClientOptions = {}) => new HttpClient({ apiKey: KEY, fetch, ...extra });

/** A resource that exposes the protected helpers generated methods use. */
class Probe extends Resource {
  get(path: string, options?: CallOptions) {
    return this._request<unknown>("GET", path, {}, options);
  }
  post(path: string, body: unknown, options?: CallOptions) {
    return this._request<unknown>("POST", path, { body, idempotent: true }, options);
  }
  list(params: { limit?: number; cursor?: string; q?: string }) {
    return this._list<number, typeof params>("/items", params, (p) => ({ q: p.q, limit: p.limit, cursor: p.cursor }), undefined);
  }
}

describe("package", () => {
  // `VERSION` and `PACKAGE_NAME` come from the generator config; package.json is
  // hand-maintained. They must name the same release.
  it("exports the name and version of package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { name: string; version: string };
    expect(VERSION).toBe(pkg.version);
    expect(PACKAGE_NAME).toBe(pkg.name);
  });
});

describe("request building", () => {
  it("sends the bearer token, JSON body, content type and base URL", async () => {
    const { fetch, calls } = mockFetch([{ status: 201, body: { id: "x" } }]);
    const probe = new Probe(http(fetch, { baseUrl: "https://example.test//" }));
    expect(await probe.post("/things", { a: 1 }, { idempotencyKey: "k1" })).toEqual({ id: "x" });
    const call = calls[0]!;
    expect(call.url).toBe("https://example.test/things");
    expect(call.method).toBe("POST");
    expect(call.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(call.headers.Accept).toBe("application/json");
    expect(call.headers["Content-Type"]).toBe("application/json");
    expect(call.headers[IDEMPOTENCY_HEADER]).toBe("k1");
    expect(call.body).toEqual({ a: 1 });
  });

  it("defaults to the production URL and generates one idempotency key per idempotent request", async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: {} }, { status: 200, body: {} }, { status: 200, body: {} }]);
    const probe = new Probe(http(fetch));
    await probe.post("/a", {});
    await probe.post("/a", {});
    await probe.get("/b");
    expect(calls[0]!.url).toBe(`${DEFAULT_BASE_URL}/a`);
    expect(calls[0]!.headers[IDEMPOTENCY_HEADER]).toMatch(/.{8,}/);
    expect(calls[1]!.headers[IDEMPOTENCY_HEADER]).not.toBe(calls[0]!.headers[IDEMPOTENCY_HEADER]);
    expect(calls[2]!.headers[IDEMPOTENCY_HEADER]).toBeUndefined();
    expect(calls[2]!.headers["Content-Type"]).toBeUndefined();
  });

  it("sends an explicit idempotency key on any method", async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: {} }]);
    await new Probe(http(fetch)).get("/b", { idempotencyKey: "k2" });
    expect(calls[0]!.headers[IDEMPOTENCY_HEADER]).toBe("k2");
  });

  it("keeps the same idempotency key across retries", async () => {
    vi.useFakeTimers();
    const { fetch, calls } = mockFetch([{ status: 503, body: { code: "engine_unavailable", message: "Retry." } }, { status: 200, body: {} }]);
    const promise = new Probe(http(fetch)).post("/a", {});
    await vi.runAllTimersAsync();
    await promise;
    expect(calls).toHaveLength(2);
    expect(calls[1]!.headers[IDEMPOTENCY_HEADER]).toBe(calls[0]!.headers[IDEMPOTENCY_HEADER]);
  });

  it("builds query strings, skipping empty values", () => {
    const client = http(mockFetch([]).fetch);
    expect(client.buildUrl("/x", { a: "b c", n: 1, t: true, u: undefined, z: null })).toBe(`${DEFAULT_BASE_URL}/x?a=b+c&n=1&t=true`);
    expect(client.buildUrl("/x", { u: undefined })).toBe(`${DEFAULT_BASE_URL}/x`);
    expect(client.buildUrl("/x")).toBe(`${DEFAULT_BASE_URL}/x`);
  });

  it("returns undefined for 204 and empty bodies", async () => {
    const { fetch } = mockFetch([{ status: 204 }, { status: 200 }]);
    const probe = new Probe(http(fetch));
    expect(await probe.get("/a")).toBeUndefined();
    expect(await probe.get("/a")).toBeUndefined();
  });

  it("maps call options", () => {
    const signal = new AbortController().signal;
    expect(callOpts(undefined)).toEqual({ idempotencyKey: undefined, signal: undefined });
    expect(callOpts({ idempotencyKey: "k", signal })).toEqual({ idempotencyKey: "k", signal });
  });

  it("falls back to a time-based key without crypto.randomUUID", () => {
    vi.stubGlobal("crypto", {});
    expect(randomKey()).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
  });
});

describe("configuration", () => {
  it("reads the API key from the environment", async () => {
    vi.stubEnv(API_KEY_ENV, KEY);
    const { fetch, calls } = mockFetch([{ status: 200, body: {} }]);
    await new Probe(new HttpClient({ fetch })).get("/a");
    expect(calls[0]!.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(new Client().baseUrl).toBe(DEFAULT_BASE_URL);
  });

  it("throws without an API key or a fetch", () => {
    vi.stubEnv(API_KEY_ENV, "");
    expect(() => new HttpClient({ fetch: mockFetch([]).fetch })).toThrow(/missing API key/);
    vi.stubGlobal("fetch", undefined);
    expect(() => new HttpClient({ apiKey: KEY })).toThrow(/no global fetch/);
  });

  it("uses the global fetch by default", async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: { ok: true } }]);
    vi.stubGlobal("fetch", fetch);
    expect(await new Probe(new HttpClient({ apiKey: KEY })).get("/a")).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
  });

  it("clamps negative retries and keeps the timeout", () => {
    const client = http(mockFetch([]).fetch, { maxRetries: -3, timeoutMs: 5 });
    expect(client.maxRetries).toBe(0);
    expect(client.timeoutMs).toBe(5);
  });

  it("scopes requests to a project", async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: {} }, { status: 200, body: {} }]);
    const base = http(fetch, { project: "  prj_1  " });
    expect(base.project).toBe("prj_1");
    await new Probe(base).get("/a");
    await new Probe(base.withProject("ext:acme")).get("/a");
    expect(calls[0]!.headers[PROJECT_HEADER]).toBe("prj_1");
    expect(calls[1]!.headers[PROJECT_HEADER]).toBe("ext:acme");
    expect(http(fetch, { project: " " }).project).toBeUndefined();
    expect(() => base.withProject("  ")).toThrow(/withProject needs/);
    expect(() => http(fetch, { project: "x".repeat(201) })).toThrow(/at most 200/);
  });

  it("scopes the client to a project", () => {
    const client = new Client({ apiKey: KEY, fetch: mockFetch([]).fetch, baseUrl: "https://example.test" });
    expect(client.project).toBeUndefined();
    const scoped = client.withProject("prj_2");
    expect(scoped).toBeInstanceOf(Client);
    expect(scoped.project).toBe("prj_2");
    expect(scoped.baseUrl).toBe("https://example.test");
  });
});

describe("errors", () => {
  it("maps the error body, status and request id", async () => {
    const { fetch } = mockFetch([
      {
        status: 402,
        body: { code: "subscription_required", message: "Start a subscription.", details: { billingUrl: "https://x.test" } },
        headers: { "x-request-id": "req_123" },
      },
    ]);
    const e = (await new Probe(http(fetch)).get("/a").catch((x: unknown) => x)) as WuapiError;
    expect(e).toBeInstanceOf(WuapiError);
    expect(e.name).toBe("WuapiError");
    expect(e.status).toBe(402);
    expect(e.code).toBe("subscription_required");
    expect(e.message).toBe("Start a subscription.");
    expect(e.details).toEqual({ billingUrl: "https://x.test" });
    expect(e.requestId).toBe("req_123");
    expect(e.retryAfter).toBeUndefined();
  });

  it("falls back to a generic code and message", async () => {
    const html = async () => new Response("<html>bad gateway</html>", { status: 400 });
    const e1 = (await new Probe(http(html)).get("/a").catch((x: unknown) => x)) as WuapiError;
    expect(e1.code).toBe("http_400");
    expect(e1.message).toBe("Request failed with status 400.");
    expect(e1.requestId).toBeUndefined();
    const { fetch } = mockFetch([{ status: 404, body: { code: 7, message: null, details: "nope" } }, { status: 409 }]);
    const probe = new Probe(http(fetch));
    const e2 = (await probe.get("/a").catch((x: unknown) => x)) as WuapiError;
    expect(e2.code).toBe("http_404");
    expect(e2.details).toBeUndefined();
    const e3 = (await probe.get("/a").catch((x: unknown) => x)) as WuapiError;
    expect(e3.code).toBe("http_409");
  });

  it("does not retry client errors", async () => {
    const { fetch, calls } = mockFetch([{ status: 409, body: { code: "account_not_ready", message: "Not connected." } }]);
    await expect(new Probe(http(fetch)).post("/a", {})).rejects.toMatchObject({ status: 409, code: "account_not_ready" });
    expect(calls).toHaveLength(1);
  });
});

describe("retries", () => {
  it("retries 429 honoring Retry-After in seconds", async () => {
    vi.useFakeTimers();
    const { fetch, calls } = mockFetch([
      { status: 429, body: { code: "rate_limited", message: "Slow down." }, headers: { "Retry-After": "3" } },
      { status: 200, body: { ok: true } },
    ]);
    const promise = new Probe(http(fetch)).get("/a");
    await vi.advanceTimersByTimeAsync(2_900);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(await promise).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it("honors Retry-After as an HTTP date and ignores garbage", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-24T09:00:00Z"));
    const { fetch, calls } = mockFetch([
      { status: 503, body: {}, headers: { "Retry-After": "Thu, 24 Sep 2026 09:00:05 GMT" } },
      { status: 503, body: {}, headers: { "Retry-After": "soon" } },
      { status: 200, body: { ok: true } },
    ]);
    const promise = new Probe(http(fetch, { maxRetries: 3 })).get("/a");
    await vi.advanceTimersByTimeAsync(4_900);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(calls).toHaveLength(2);
    await vi.runAllTimersAsync();
    expect(calls).toHaveLength(3);
    expect(await promise).toEqual({ ok: true });
  });

  it("waits up to 60 s, and fails at once when Retry-After is longer (a cooldown)", async () => {
    vi.useFakeTimers();
    const { fetch, calls } = mockFetch([
      { status: 429, body: {}, headers: { "Retry-After": "60" } },
      {
        status: 429,
        body: { code: "rate_limited", message: "Changed less than 10 minutes ago.", details: { retryAfterMs: 600_000 } },
        headers: { "Retry-After": "600" },
      },
    ]);
    const promise = new Probe(http(fetch, { maxRetries: 3 })).get("/a");
    const settled = expect(promise).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
      retryAfter: 600,
      details: { retryAfterMs: 600_000 },
    });
    await vi.advanceTimersByTimeAsync(59_900);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200);
    await settled;
    expect(calls).toHaveLength(2);
  });

  it("parses a past HTTP date as no wait", async () => {
    const { fetch } = mockFetch([{ status: 429, body: {}, headers: { "Retry-After": "Thu, 01 Jan 2020 00:00:00 GMT" } }]);
    await expect(new Probe(http(fetch, { maxRetries: 0 })).get("/a")).rejects.toMatchObject({ retryAfter: 0 });
  });

  it("gives up after maxRetries and throws the last error", async () => {
    const reply = { status: 429, body: { code: "rate_limited", message: "Slow down." }, headers: { "Retry-After": "0" } };
    const { fetch, calls } = mockFetch([reply, reply, reply]);
    await expect(new Probe(http(fetch, { maxRetries: 2 })).get("/a")).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
      retryAfter: 0,
    });
    expect(calls).toHaveLength(3);
  });

  it("retries 5xx and network errors, then succeeds", async () => {
    vi.useFakeTimers();
    const { fetch, calls } = mockFetch([{ status: 500, body: { code: "internal_error", message: "Boom." } }, new TypeError("fetch failed"), { status: 200, body: { ok: 1 } }]);
    const promise = new Probe(http(fetch)).get("/a");
    await vi.runAllTimersAsync();
    expect(await promise).toEqual({ ok: 1 });
    expect(calls).toHaveLength(3);
  });

  it("reports network errors once retries run out", async () => {
    const { fetch } = mockFetch([new TypeError("fetch failed")]);
    await expect(new Probe(http(fetch, { maxRetries: 0 })).get("/a")).rejects.toMatchObject({
      status: 0,
      code: "network_error",
      message: "Network error: fetch failed",
    });
    const odd = async () => {
      throw "boom";
    };
    await expect(new Probe(http(odd, { maxRetries: 0 })).get("/a")).rejects.toMatchObject({ message: "Network error: boom" });
  });
});

describe("timeouts and aborts", () => {
  const hanging = (init: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    });

  it("times out each attempt", async () => {
    vi.useFakeTimers();
    const promise = new Probe(http((_url, init) => hanging(init), { timeoutMs: 50, maxRetries: 0 })).get("/a");
    const check = expect(promise).rejects.toMatchObject({ status: 0, code: "timeout", message: "Request timed out after 50 ms." });
    await vi.advanceTimersByTimeAsync(60);
    await check;
  });

  it("aborts in flight and before sending", async () => {
    const controller = new AbortController();
    const promise = new Probe(http((_url, init) => hanging(init))).get("/a", { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: "aborted" });
    const { fetch, calls } = mockFetch([]);
    await expect(new Probe(http(fetch)).get("/a", { signal: AbortSignal.abort() })).rejects.toMatchObject({ code: "aborted" });
    expect(calls).toHaveLength(0);
  });
});

describe("pagination", () => {
  const page = (items: number[], nextCursor: string | null): Page<number> => ({ object: "list", items, nextCursor });

  it("walks every page from the starting cursor", async () => {
    const { fetch, calls } = mockFetch([{ status: 200, body: page([1, 2], "c2") }, { status: 200, body: page([3], null) }]);
    const items: number[] = [];
    for await (const n of new Probe(http(fetch)).list({ q: "x", limit: 2, cursor: "c1" })) items.push(n);
    expect(items).toEqual([1, 2, 3]);
    expect(calls.map((c) => c.url)).toEqual([`${DEFAULT_BASE_URL}/items?q=x&limit=2&cursor=c1`, `${DEFAULT_BASE_URL}/items?q=x&limit=2&cursor=c2`]);
  });

  it("fetches single pages and caps toArray", async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: page([1], "c2") },
      { status: 200, body: page([9], null) },
      { status: 200, body: page([1, 2], "c2") },
    ]);
    const list = new Probe(http(fetch)).list({});
    expect((await list.page()).nextCursor).toBe("c2");
    expect((await list.page("c2")).items).toEqual([9]);
    expect(await list.toArray(1)).toEqual([1]);
    expect(await list.toArray(0)).toEqual([]);
    expect(calls.map((c) => c.url)).toEqual([`${DEFAULT_BASE_URL}/items`, `${DEFAULT_BASE_URL}/items?cursor=c2`, `${DEFAULT_BASE_URL}/items`]);
  });

  it("iterates pages", async () => {
    const pages = new Paginator<number>(async (p) => page([p.cursor ? 2 : 1], p.cursor ? null : "c2"), {});
    const seen: number[][] = [];
    for await (const p of pages.pages()) seen.push(p.items);
    expect(seen).toEqual([[1], [2]]);
    expect(await pages.toArray()).toEqual([1, 2]);
  });
});
