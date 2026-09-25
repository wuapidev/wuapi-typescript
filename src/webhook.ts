import { WebhookVerificationError } from "./errors.js";
import type { WebhookEvent } from "./types.js";

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  let out = "";
  for (const b of new Uint8Array(buf)) out += b.toString(16).padStart(2, "0");
  return out;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getSubtle(): SubtleCrypto {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) {
    throw new Error("wuapi: WebCrypto is not available. Use Node 18+, Bun, Deno or an edge runtime.");
  }
  return subtle;
}

/** Compute the `v1` signature for a timestamp and raw body. */
export async function computeSignature(secret: string, timestamp: number | string, rawBody: string): Promise<string> {
  const subtle = getSubtle();
  const key = await subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  return toHex(sig);
}

/**
 * Verify a webhook request and return its parsed event.
 *
 * @param rawBody The request body exactly as received, before any JSON parsing.
 * @param header The `Wuapi-Signature` header (`t=<unix seconds>,v1=<hex>`).
 * @param secret The endpoint's signing secret (`whsec_...`).
 * @param toleranceSec Maximum age (and clock skew) of the timestamp. Defaults to 300.
 * @throws WebhookVerificationError when the header is missing or malformed,
 *   no signature matches, or the timestamp is outside the tolerance.
 */
export async function verifyWebhook(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  toleranceSec = 300,
): Promise<WebhookEvent> {
  if (!header) throw new WebhookVerificationError("Missing Wuapi-Signature header.");
  if (!secret) throw new WebhookVerificationError("Missing webhook secret.");

  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k === "t") timestamp = v;
    else if (k === "v1") signatures.push(v.toLowerCase());
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) {
    throw new WebhookVerificationError("Malformed Wuapi-Signature header.");
  }

  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (Math.abs(age) > toleranceSec) {
    throw new WebhookVerificationError("Webhook timestamp is outside the tolerance window.");
  }

  const expected = await computeSignature(secret, timestamp, rawBody);
  if (!signatures.some((s) => timingSafeEqual(s, expected))) {
    throw new WebhookVerificationError("Webhook signature does not match.");
  }

  try {
    return JSON.parse(rawBody) as WebhookEvent;
  } catch {
    throw new WebhookVerificationError("Webhook body is not valid JSON.");
  }
}
