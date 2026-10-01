// Hand-written: src/custom/uploads.ts, the file upload helper.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Wuapi, WuapiError, type FetchLike } from "../../src/index.js";

const KEY = "wu_live_" + "a".repeat(48);
const UPLOAD_URL = "https://files.example.com/api/storage/upload?token=t";

afterEach(() => {
  vi.useRealTimers();
});

const upload = (overrides: Record<string, unknown> = {}) => ({
  object: "upload",
  id: "upl_1",
  projectId: null,
  status: "ready",
  mimeType: "image/png",
  filename: null,
  size: 3,
  uploadUrl: null,
  expiresAt: "2026-10-02T09:00:00.000Z",
  createdAt: "2026-10-01T09:00:00.000Z",
  ...overrides,
});

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** The parsed JSON of an API call, or the Blob posted to the upload URL. */
  body: unknown;
}

/** A reply, or what the fetch throws: an Error, or (as some runtimes do) a bare string. */
type Reply = { status: number; body?: unknown; text?: string } | Error | string;

/** A fetch that records calls (JSON bodies parsed, Blob bodies kept) and answers from a queue. */
function mockFetch(replies: Reply[]): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const queue = [...replies];
  const fetch: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: init.method ?? "GET",
      headers: { ...(init.headers as Record<string, string>) },
      body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
    });
    const reply = queue.shift();
    if (!reply) throw new Error(`Unexpected request: ${init.method} ${url}`);
    if (reply instanceof Error || typeof reply === "string") throw reply;
    return new Response(reply.text ?? JSON.stringify(reply.body ?? {}), { status: reply.status });
  };
  return { fetch, calls };
}

const big = (size = 2 * 1024 * 1024) => new Uint8Array(size).fill(7);

describe("uploads.upload", () => {
  it("sends a small file in one request, as base64, with the Blob's own type", async () => {
    const { fetch, calls } = mockFetch([{ status: 201, body: upload() }]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    const result = await client.uploads.upload(new Blob(["png"], { type: "image/png" }));
    expect(result.id).toBe("upl_1");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.wuapi.dev/v1/uploads");
    expect(calls[0]!.body).toEqual({ mimeType: "image/png", base64: btoa("png") });
    expect(calls[0]!.headers["Idempotency-Key"]).toMatch(/.+/);
  });

  it("takes a File's name, and lets params override the type and the name", async () => {
    const { fetch, calls } = mockFetch([{ status: 201, body: upload() }, { status: 201, body: upload() }]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    const file = new File(["png"], "paste.png", { type: "image/png" });
    await client.uploads.upload(file);
    expect(calls[0]!.body).toEqual({ mimeType: "image/png", filename: "paste.png", base64: btoa("png") });
    await client.uploads.upload(file, { mimeType: "application/octet-stream", filename: "raw.bin" }, { idempotencyKey: "k1" });
    expect(calls[1]!.body).toEqual({ mimeType: "application/octet-stream", filename: "raw.bin", base64: btoa("png") });
    expect(calls[1]!.headers["Idempotency-Key"]).toBe("k1");
  });

  it("takes an ArrayBuffer, a view of part of a buffer, and a stream", async () => {
    const { fetch, calls } = mockFetch([{ status: 201, body: upload() }, { status: 201, body: upload() }, { status: 201, body: upload() }]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    const bytes = new TextEncoder().encode("xxOggSyy");
    await client.uploads.upload(bytes.buffer.slice(2, 6) as ArrayBuffer, { mimeType: "audio/ogg" });
    await client.uploads.upload(bytes.subarray(2, 6), { mimeType: "audio/ogg" });
    await client.uploads.upload(new Blob(["OggS"]).stream() as ReadableStream<Uint8Array>, { mimeType: "audio/ogg" });
    for (const call of calls) expect(call.body).toEqual({ mimeType: "audio/ogg", base64: btoa("OggS") });
  });

  it("needs a MIME type when the file has none", async () => {
    const { fetch, calls } = mockFetch([]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    await expect(client.uploads.upload(new Uint8Array([1]))).rejects.toMatchObject({ code: "invalid_request" });
    await expect(client.uploads.upload(new Blob(["x"]))).rejects.toBeInstanceOf(WuapiError);
    expect(calls).toHaveLength(0);
  });

  it("posts a larger file to the upload URL and completes it", async () => {
    const data = big();
    const { fetch, calls } = mockFetch([
      { status: 201, body: upload({ status: "pending", uploadUrl: UPLOAD_URL, size: data.length }) },
      { status: 200, body: { storageId: "st_1" } },
      { status: 200, body: upload({ size: data.length }) },
    ]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    const controller = new AbortController();
    const result = await client.uploads.upload(data, { mimeType: "video/mp4", filename: "clip.mp4" }, { idempotencyKey: "up-9", signal: controller.signal });
    expect(result.status).toBe("ready");
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST https://api.wuapi.dev/v1/uploads",
      `POST ${UPLOAD_URL}`,
      "POST https://api.wuapi.dev/v1/uploads/upl_1/complete",
    ]);
    expect(calls[0]!.body).toEqual({ mimeType: "video/mp4", filename: "clip.mp4", size: data.length });
    expect(calls[0]!.headers["Idempotency-Key"]).toBe("up-9");
    // The bytes go to storage without the API key.
    expect(calls[1]!.headers).toEqual({ "Content-Type": "video/mp4" });
    expect((calls[1]!.body as Blob).size).toBe(data.length);
    expect(calls[2]!.body).toEqual({ storageId: "st_1" });
    expect(calls[2]!.headers["Idempotency-Key"]).toBe("up-9:complete");
  });

  it("honors inlineMaxBytes, never above what the API takes inline", async () => {
    const { fetch, calls } = mockFetch([
      { status: 201, body: upload({ status: "pending", uploadUrl: UPLOAD_URL }) },
      { status: 200, body: { storageId: "st_1" } },
      { status: 200, body: upload() },
      { status: 201, body: upload({ status: "pending", uploadUrl: UPLOAD_URL }) },
      { status: 200, body: { storageId: "st_2" } },
      { status: 200, body: upload() },
    ]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    await client.uploads.upload(new Blob(["png"], { type: "image/png" }), { inlineMaxBytes: 0 });
    expect(calls[0]!.body).toEqual({ mimeType: "image/png", size: 3 });
    await client.uploads.upload(big(5 * 1024 * 1024 + 1), { mimeType: "video/mp4", inlineMaxBytes: 50 * 1024 * 1024 });
    expect(calls[3]!.body).toEqual({ mimeType: "video/mp4", size: 5 * 1024 * 1024 + 1 });
  });

  it("returns a replayed create that is already ready, and refuses one with no URL left", async () => {
    const { fetch, calls } = mockFetch([
      { status: 201, body: upload() },
      { status: 201, body: upload({ status: "pending" }) },
    ]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    expect((await client.uploads.upload(big(), { mimeType: "video/mp4" })).status).toBe("ready");
    await expect(client.uploads.upload(big(), { mimeType: "video/mp4" })).rejects.toMatchObject({ code: "upload_failed" });
    expect(calls).toHaveLength(2);
  });

  it("retries a dropped connection and a 5xx while posting the bytes", async () => {
    vi.useFakeTimers();
    const { fetch, calls } = mockFetch([
      { status: 201, body: upload({ status: "pending", uploadUrl: UPLOAD_URL }) },
      new Error("socket hang up"),
      { status: 503 },
      { status: 200, body: { storageId: "st_1" } },
      { status: 200, body: upload() },
    ]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    const promise = client.uploads.upload(big(), { mimeType: "video/mp4" });
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await promise).status).toBe("ready");
    expect(calls.filter((c) => c.url === UPLOAD_URL)).toHaveLength(3);
  });

  it("gives up with upload_failed: retries used up, a refusal, an answer without a storageId", async () => {
    vi.useFakeTimers();
    const pending = { status: 201, body: upload({ status: "pending", uploadUrl: UPLOAD_URL }) };
    const run = async (replies: Reply[]) => {
      const { fetch, calls } = mockFetch([pending, ...replies]);
      const promise = new Wuapi({ apiKey: KEY, fetch }).uploads.upload(big(), { mimeType: "video/mp4" });
      const settled = promise.then(
        () => null,
        (e: unknown) => e as WuapiError,
      );
      await vi.advanceTimersByTimeAsync(5_000);
      return { error: await settled, posts: calls.filter((c) => c.url === UPLOAD_URL).length };
    };

    const dropped = await run([new Error("ECONNRESET"), "thrown string", new Error("ECONNRESET")]);
    expect(dropped.posts).toBe(3);
    expect(dropped.error).toMatchObject({ code: "upload_failed", message: "The file could not be posted to the upload URL: ECONNRESET." });

    // An expired or refused URL is not repeated; 408 and 429 are.
    const refused = await run([{ status: 403 }]);
    expect(refused.posts).toBe(1);
    expect(refused.error?.message).toContain("answered 403");
    const slow = await run([{ status: 408 }, { status: 429 }, { status: 200, body: { storageId: "" } }]);
    expect(slow.posts).toBe(3);
    expect(slow.error?.message).toContain("without a storageId");
    const garbage = await run([{ status: 200, text: "not json" }, { status: 200, body: {} }, { status: 200, text: "null" }]);
    expect(garbage.posts).toBe(3);
    expect(garbage.error).toMatchObject({ code: "upload_failed" });
  });

  it("stops when the caller aborts while the bytes are being posted", async () => {
    const controller = new AbortController();
    let posts = 0;
    const fetch: FetchLike = async (url, init) => {
      if (url !== UPLOAD_URL) return new Response(JSON.stringify(upload({ status: "pending", uploadUrl: UPLOAD_URL })), { status: 201 });
      posts++;
      return await new Promise<Response>((_, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        controller.abort();
      });
    };
    const promise = new Wuapi({ apiKey: KEY, fetch }).uploads.upload(big(), { mimeType: "video/mp4", uploadTimeoutMs: 1_000 }, { signal: controller.signal });
    await expect(promise).rejects.toMatchObject({ code: "aborted" });
    expect(posts).toBe(1);
  });
});
