// Copied by wuapi-codegen from packages/sdk-codegen/templates/typescript/test/stream-helpers.ts. Do not edit here.

import { readFileSync } from "node:fs";
import type { FetchLike } from "../src/index.js";
import type { StreamRuntime, StreamSpec } from "../src/stream.js";

/** The conformance suite, as the generator wrote it next to this file. */
const SUITE = new URL("./stream-conformance/", import.meta.url);

export const suiteText = (path: string): string => readFileSync(new URL(path, SUITE), "utf8");
export const suiteBytes = (path: string): Uint8Array => new Uint8Array(readFileSync(new URL(path, SUITE)));

interface Description {
  path: string;
  resume_header: string;
  reset_event: string;
  filters: string[];
  timing: Record<string, number>;
  limits: Record<string, number>;
  refusals: { status: number; code?: string; error?: string; api_only?: boolean; wait?: number }[];
}

export const STREAM_HOST = "https://stream.example.test";

/** The stream the scenarios were computed for: `description.json`, as a `StreamSpec`. */
export function suiteSpec(): StreamSpec {
  const d = JSON.parse(suiteText("description.json")) as Description;
  const t = d.timing as Record<string, number>;
  const l = d.limits as Record<string, number>;
  return {
    baseUrl: STREAM_HOST,
    path: d.path,
    resumeHeader: d.resume_header,
    resetEvent: d.reset_event,
    timing: {
      retryMs: t.retry!,
      heartbeatMs: t.heartbeat!,
      idleTimeoutMs: t.idle_timeout!,
      openTimeoutMs: t.open_timeout!,
      backoffBaseMs: t.backoff_base!,
      backoffCapMs: t.backoff_cap!,
      minGapMs: t.min_gap!,
      stableAfterMs: t.stable_after!,
      retryMaxMs: t.retry_max!,
      retryAfterMaxMs: t.retry_after_max!,
      replayWindowMs: t.replay_window!,
    },
    limits: {
      connectBudget: l.connect_budget!,
      connectBudgetWindowMs: l.connect_budget_window!,
      maxFrameBytes: l.max_frame_bytes!,
      dedupeWindow: l.dedupe_window!,
    },
    refusals: d.refusals.map((r) => ({
      status: r.status,
      ...(r.code !== undefined ? { code: r.code } : {}),
      ...(r.error !== undefined ? { error: r.error as NonNullable<StreamSpec["refusals"][number]["error"]> } : {}),
      ...(r.api_only ? { apiOnly: true } : {}),
      ...(r.wait !== undefined ? { waitMs: r.wait } : {}),
    })),
  };
}

/**
 * Virtual time. `sleep` never uses a real timer: `step` moves the clock to
 * the earliest sleeper and wakes it, so a test decides when time passes.
 */
export class VirtualClock implements StreamRuntime {
  time = 0;
  #seq = 0;
  #timers: { at: number; seq: number; wake: () => void }[] = [];
  #draws: number[];

  constructor(draws: number[] = [0]) {
    this.#draws = [...draws];
  }

  now = (): number => this.time;

  random = (): number => (this.#draws.length > 1 ? this.#draws.shift()! : this.#draws[0]!);

  sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
    new Promise<void>((resolve) => {
      if (signal?.aborted) return resolve();
      const timer = { at: this.time + ms, seq: this.#seq++, wake: resolve };
      this.#timers.push(timer);
      signal?.addEventListener(
        "abort",
        () => {
          this.#timers = this.#timers.filter((t) => t !== timer);
          resolve();
        },
        { once: true },
      );
    });

  /** The time of the earliest sleeper, when there is one. */
  next(): number | undefined {
    this.#timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
    return this.#timers[0]?.at;
  }

  /** Wakes the earliest sleeper. */
  step(): void {
    this.next();
    const timer = this.#timers.shift()!;
    this.time = Math.max(this.time, timer.at);
    timer.wake();
  }
}

/** Lets every promise that can settle without time passing do so. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise<void>((resolve) => setImmediate(resolve));
}

export type Step = { text: string } | { hex: string } | { file: string; chunk_bytes?: number } | { wait_ms: number };

export interface ScriptedResponse {
  unreachable?: boolean;
  hang?: boolean;
  after_ms?: number;
  status?: number;
  headers?: Record<string, string>;
  body?: { file?: string; text?: string };
  stream?: Step[];
  end?: "close" | "error" | "hang";
}

export interface SeenConnect {
  at: number;
  method: string;
  url: URL;
  headers: Record<string, string>;
  redirect: unknown;
}

function chunks(step: Exclude<Step, { wait_ms: number }>): Uint8Array[] {
  if ("text" in step) return [new TextEncoder().encode(step.text)];
  if ("hex" in step) return [Uint8Array.from(step.hex.match(/../g)!.map((pair) => Number.parseInt(pair, 16)))];
  const bytes = suiteBytes(step.file);
  if (!step.chunk_bytes) return [bytes];
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += step.chunk_bytes) out.push(bytes.slice(i, i + step.chunk_bytes));
  return out;
}

const aborted = () => new DOMException("This operation was aborted", "AbortError");

/**
 * A `fetch` that plays a script: connect number n gets `responses[n]`, on the
 * virtual clock. Everything honours the request's signal, as `fetch` does.
 */
export function scriptedFetch(clock: VirtualClock, responses: ScriptedResponse[]): { fetch: FetchLike; seen: SeenConnect[] } {
  const seen: SeenConnect[] = [];
  const fetch: FetchLike = async (url, init) => {
    const signal = init.signal!;
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(init.headers as Record<string, string>)) headers[name.toLowerCase()] = value;
    seen.push({ at: clock.time, method: init.method!, url: new URL(url), headers, redirect: init.redirect });
    const response = responses[seen.length - 1];
    if (!response) throw new Error(`unexpected connect number ${seen.length}`);
    if (response.after_ms) await clock.sleep(response.after_ms, signal);
    if (signal.aborted) throw aborted();
    if (response.unreachable) throw new TypeError("fetch failed");
    if (response.hang) {
      return new Promise<Response>((_, reject) => signal.addEventListener("abort", () => reject(aborted()), { once: true }));
    }
    if (!response.stream) {
      const body = response.body?.file !== undefined ? suiteText(response.body.file) : (response.body?.text ?? "");
      return new Response(body, { status: response.status!, headers: response.headers ?? {} });
    }
    // One chunk per read, so a body that breaks does so after what came
    // before it was read, as a connection does.
    const steps = [...response.stream];
    const queue: Uint8Array[] = [];
    const body = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          signal.addEventListener("abort", () => controller.error(aborted()), { once: true });
        },
        async pull(controller) {
          while (queue.length === 0 && steps.length > 0) {
            const step = steps.shift()!;
            if ("wait_ms" in step) await clock.sleep(step.wait_ms, signal);
            else queue.push(...chunks(step));
            if (signal.aborted) return;
          }
          const chunk = queue.shift();
          if (chunk) controller.enqueue(chunk);
          else if (response.end === "close") controller.close();
          else if (response.end === "error") controller.error(new TypeError("terminated"));
          else await new Promise<never>(() => undefined);
        },
      },
      { highWaterMark: 0 },
    );
    return new Response(body, { status: response.status!, headers: response.headers ?? {} });
  };
  return { fetch, seen };
}
