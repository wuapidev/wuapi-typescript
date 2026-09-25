import { WuapiError } from "./errors.js";
import type { CallOptions } from "./types.js";

export const VERSION = "0.1.1";
export const DEFAULT_BASE_URL = "https://api.wuapi.dev";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface ClientOptions {
  /** API key (`wu_live_...`). Falls back to the `WUAPI_API_KEY` environment variable. */
  apiKey?: string;
  /** Defaults to https://api.wuapi.dev. */
  baseUrl?: string;
  /** Per-attempt timeout in milliseconds. Defaults to 30000. */
  timeoutMs?: number;
  /** Retries after the first attempt. Defaults to 2. */
  maxRetries?: number;
  /** Custom fetch implementation. Defaults to the global `fetch`. */
  fetch?: FetchLike;
  /**
   * Act inside one project: its id, or `ext:<externalId>`. Sent as the
   * `Wuapi-Project` header on every request. With a project API key it may be
   * omitted (the key already names its project).
   */
  project?: string;
}

export const PROJECT_HEADER = "Wuapi-Project";

export type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Query | undefined;
  body?: unknown;
  /**
   * Sent as `Idempotency-Key`. Every POST gets a random one when this is
   * omitted, so a retried POST is replayed by the server instead of repeated.
   */
  idempotencyKey?: string | undefined;
  signal?: AbortSignal | undefined;
}

export const IDEMPOTENCY_HEADER = "Idempotency-Key";

const MAX_BACKOFF_MS = 8_000;
const MAX_RETRY_AFTER_MS = 60_000;

function readEnvApiKey(): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env?.WUAPI_API_KEY;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, (date - Date.now()) / 1000);
  return undefined;
}

export class HttpClient {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  /** The `Wuapi-Project` header value, when this client is scoped to a project. */
  readonly project: string | undefined;
  readonly #apiKey: string;
  readonly #fetch: FetchLike;
  readonly #options: ClientOptions;

  constructor(options: ClientOptions = {}) {
    const apiKey = options.apiKey ?? readEnvApiKey();
    if (!apiKey) {
      throw new Error(
        "wuapi: missing API key. Pass { apiKey } or set the WUAPI_API_KEY environment variable.",
      );
    }
    this.#apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = Math.max(0, options.maxRetries ?? 2);
    if (!options.fetch && typeof globalThis.fetch !== "function") throw new Error("wuapi: no global fetch found. Use Node 18+ or pass { fetch }.");
    this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    const project = options.project?.trim();
    if (project !== undefined && project.length > 200) throw new Error("wuapi: `project` must be at most 200 characters.");
    this.project = project ? project : undefined;
    this.#options = { ...options, apiKey };
  }

  /** A client with the same configuration, scoped to another project. */
  withProject(project: string): HttpClient {
    if (!project || !project.trim()) throw new Error("wuapi: withProject needs a project id or `ext:<externalId>`.");
    return new HttpClient({ ...this.#options, project });
  }

  buildUrl(path: string, query?: Query): string {
    let url = this.baseUrl + path;
    if (query) {
      const search = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) search.append(k, String(v));
      }
      const s = search.toString();
      if (s) url += `?${s}`;
    }
    return url;
  }

  async request<T>(opts: RequestOptions): Promise<T> {
    const url = this.buildUrl(opts.path, opts.query);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.#apiKey}`,
      Accept: "application/json",
    };
    if (this.project) headers[PROJECT_HEADER] = this.project;
    // Every method is safe to repeat: GET/PUT/PATCH/DELETE by nature, POST
    // through the idempotency key the server replays.
    if (opts.method === "POST" || opts.idempotencyKey !== undefined) {
      headers[IDEMPOTENCY_HEADER] = opts.idempotencyKey ?? randomKey();
    }
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }

    for (let attempt = 0; ; attempt++) {
      const canRetry = attempt < this.maxRetries;
      let response: Response;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const onAbort = () => controller.abort();
      opts.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        if (opts.signal?.aborted) throw opts.signal.reason ?? new Error("Aborted");
        response = await this.#fetch(url, {
          method: opts.method,
          headers,
          ...(body !== undefined ? { body } : {}),
          signal: controller.signal,
        });
      } catch (cause) {
        clearTimeout(timer);
        opts.signal?.removeEventListener("abort", onAbort);
        if (opts.signal?.aborted) {
          throw new WuapiError({ status: 0, code: "aborted", message: "Request aborted.", cause });
        }
        const timedOut = controller.signal.aborted;
        if (canRetry) {
          await sleep(this.#backoff(attempt));
          continue;
        }
        throw new WuapiError({
          status: 0,
          code: timedOut ? "timeout" : "network_error",
          message: timedOut
            ? `Request timed out after ${this.timeoutMs} ms.`
            : `Network error: ${cause instanceof Error ? cause.message : String(cause)}`,
          cause,
        });
      }
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);

      if (response.ok) {
        if (response.status === 204) return undefined as T;
        const text = await response.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }

      const error = await this.#toError(response);
      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && canRetry) {
        const wait =
          error.retryAfter !== undefined
            ? Math.min(error.retryAfter * 1000, MAX_RETRY_AFTER_MS)
            : this.#backoff(attempt);
        await sleep(wait);
        continue;
      }
      throw error;
    }
  }

  #backoff(attempt: number): number {
    const base = Math.min(500 * 2 ** attempt, MAX_BACKOFF_MS);
    return base / 2 + Math.random() * (base / 2);
  }

  async #toError(response: Response): Promise<WuapiError> {
    const requestId = response.headers.get("x-request-id") ?? undefined;
    const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
    let code = `http_${response.status}`;
    let message = `Request failed with status ${response.status}.`;
    let details: Record<string, unknown> | undefined;
    try {
      const text = await response.text();
      if (text) {
        const parsed = JSON.parse(text) as { code?: unknown; message?: unknown; details?: unknown };
        if (typeof parsed.code === "string") code = parsed.code;
        if (typeof parsed.message === "string") message = parsed.message;
        if (parsed.details && typeof parsed.details === "object") {
          details = parsed.details as Record<string, unknown>;
        }
      }
    } catch {
      // Non-JSON body: keep the generic message.
    }
    return new WuapiError({ status: response.status, code, message, details, requestId, retryAfter });
  }
}

export const enc = encodeURIComponent;

/** Spread into `RequestOptions`. */
export function callOpts(options: CallOptions | undefined): Pick<RequestOptions, "idempotencyKey" | "signal"> {
  return { idempotencyKey: options?.idempotencyKey, signal: options?.signal };
}

/** A random idempotency key, so automatic retries never repeat a POST. */
export function randomKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

/** `/v1/accounts/{accountId}` plus a suffix, with every segment encoded. */
export function accountPath(accountId: string, suffix = ""): string {
  return `/v1/accounts/${enc(accountId)}${suffix}`;
}
