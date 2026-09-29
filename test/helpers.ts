// Copied by wuapi-codegen from packages/sdk-codegen/templates/typescript/test/helpers.ts. Do not edit here.

import type { FetchLike } from "../src/index.js";

/** A syntactically valid API key for tests. */
export const KEY = "wu_live_" + "a".repeat(48);

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
