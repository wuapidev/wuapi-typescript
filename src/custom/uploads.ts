// Hand-written: the upload helper the spec cannot describe. The generated
// UploadsResource extends UploadsBase (see `bases` in wuapi.sdk.toml).

import type { CallOptions } from "../core.js";
import { randomKey } from "../core.js";
import { WuapiError } from "../errors.js";
import { Resource } from "../resources/base.js";
import type { Upload, UploadsCompleteParams, UploadsCreateParams } from "../types.js";

/** What `uploads.upload()` takes: the bytes of one file. A stream is read into memory first. */
export type UploadFile = Blob | ArrayBuffer | ArrayBufferView | ReadableStream<Uint8Array>;

export interface UploadFileParams {
  /**
   * The file's MIME type (`image/jpeg`, `audio/ogg; codecs=opus`). Defaults to
   * the `type` of a `Blob` or `File`; required for anything else.
   */
  mimeType?: string;
  /** The file name a recipient sees for a document. Defaults to the `name` of a `File`. */
  filename?: string;
  /**
   * Files up to this size go in one request (base64). Larger ones are posted
   * straight to storage through an upload URL. Defaults to 1 MiB; the API
   * takes at most 5 MB inline.
   */
  inlineMaxBytes?: number;
  /** How long posting the bytes to the upload URL may take, in milliseconds. Defaults to 10 minutes. */
  uploadTimeoutMs?: number;
}

const DEFAULT_INLINE_MAX_BYTES = 1024 * 1024;
const API_INLINE_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_UPLOAD_TIMEOUT_MS = 10 * 60_000;
const BYTES_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function toBlob(file: UploadFile, mimeType: string): Promise<Blob> {
  if (file instanceof Blob) return file;
  if (file instanceof ArrayBuffer) return new Blob([file], { type: mimeType });
  if (ArrayBuffer.isView(file)) {
    // A copy of exactly the view's bytes (a Node Buffer may share a larger pool).
    const bytes = new Uint8Array(file.byteLength);
    bytes.set(new Uint8Array(file.buffer, file.byteOffset, file.byteLength));
    return new Blob([bytes], { type: mimeType });
  }
  return await new Response(file).blob();
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** The hand-written part of `wuapi.uploads`: upload a file in one call. */
export abstract class UploadsBase extends Resource {
  /** Create an upload (generated). */
  abstract create(params: UploadsCreateParams, options?: CallOptions): Promise<Upload>;
  /** Complete an upload (generated). */
  abstract complete(uploadId: string, params: UploadsCompleteParams, options?: CallOptions): Promise<Upload>;

  /**
   * Upload a file and return its `ready` upload. Send it with
   * `messages.send({ ..., media: { uploadId: upload.id } })`, as many times
   * as needed until `upload.expiresAt` (24 hours).
   *
   * A small file goes in one request. A larger one is created, posted
   * straight to storage through its upload URL, and completed; a dropped
   * connection while posting is retried. Up to 100 MB.
   *
   * `options.idempotencyKey` names the whole upload: calling again with the
   * same key and the same file answers the same upload.
   *
   * Throws a `WuapiError` with code `upload_failed` when the bytes could not
   * be posted, besides the API's own errors (`media_too_large`, `rate_limited`).
   */
  async upload(file: UploadFile, params: UploadFileParams = {}, options: CallOptions = {}): Promise<Upload> {
    const named = file as { name?: unknown; type?: unknown };
    const mimeType = params.mimeType ?? (typeof named.type === "string" && named.type ? named.type : undefined);
    if (!mimeType) {
      throw new WuapiError({ status: 0, code: "invalid_request", message: "uploads.upload needs `mimeType`: the file has no type of its own." });
    }
    const filename = params.filename ?? (typeof named.name === "string" && named.name ? named.name : undefined);
    const blob = await toBlob(file, mimeType);
    const key = options.idempotencyKey ?? randomKey();
    const call = (suffix: string): CallOptions => ({ idempotencyKey: `${key}${suffix}`, ...(options.signal ? { signal: options.signal } : {}) });
    const base = { mimeType, ...(filename !== undefined ? { filename } : {}) };

    const inlineMax = Math.min(params.inlineMaxBytes ?? DEFAULT_INLINE_MAX_BYTES, API_INLINE_MAX_BYTES);
    if (blob.size <= inlineMax) {
      const base64 = toBase64(new Uint8Array(await blob.arrayBuffer()));
      return await this.create({ ...base, base64 }, call(""));
    }

    const created = await this.create({ ...base, size: blob.size }, call(""));
    if (created.status === "ready") return created;
    if (!created.uploadUrl) {
      // A replay of a create whose answer was already used: the URL is on that first answer only.
      throw new WuapiError({ status: 0, code: "upload_failed", message: `Upload ${created.id} has no upload URL. Start again with a new idempotency key.` });
    }
    const storageId = await this.#postBytes(created.uploadUrl, blob, mimeType, params.uploadTimeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS, options.signal);
    return await this.complete(created.id, { storageId }, call(":complete"));
  }

  /** POST the bytes to the upload URL; storage answers `{ storageId }`. Retried when the connection drops. */
  async #postBytes(url: string, blob: Blob, mimeType: string, timeoutMs: number, signal: AbortSignal | undefined): Promise<string> {
    let last = "no answer";
    for (let attempt = 1; attempt <= BYTES_ATTEMPTS; attempt++) {
      try {
        const res = await this.http.fetchExternal(url, { method: "POST", headers: { "Content-Type": mimeType }, body: blob }, { timeoutMs, signal });
        if (res.ok) {
          const parsed = (await res.json().catch(() => null)) as { storageId?: unknown } | null;
          if (parsed && typeof parsed.storageId === "string" && parsed.storageId) return parsed.storageId;
          last = "the upload URL answered without a storageId";
        } else {
          last = `the upload URL answered ${res.status}`;
          // A refusal (an expired URL, a bad request) does not get better by repeating it.
          if (res.status < 500 && res.status !== 408 && res.status !== 429) break;
        }
      } catch (cause) {
        if (signal?.aborted) throw new WuapiError({ status: 0, code: "aborted", message: "Request aborted.", cause });
        last = cause instanceof Error ? cause.message : String(cause);
      }
      if (attempt < BYTES_ATTEMPTS) await sleep(500 * 2 ** (attempt - 1));
    }
    throw new WuapiError({ status: 0, code: "upload_failed", message: `The file could not be posted to the upload URL: ${last}.` });
  }
}
