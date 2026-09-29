// Copied by wuapi-codegen from packages/sdk-codegen/templates/typescript/test/webhook.test.ts. Do not edit here.

import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeSignature, verifyWebhook, WebhookVerificationError } from "../src/index.js";

const SECRET = "whsec_" + "b".repeat(48);
const body = JSON.stringify({ id: "evt_1", object: "event", type: "message.received", data: { object: { id: "msg_1" } } });

const now = () => Math.floor(Date.now() / 1000);
const sign = (t: number, raw = body, secret = SECRET) =>
  createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyWebhook", () => {
  it("accepts a valid signature and returns the parsed event", async () => {
    const t = now();
    await expect(verifyWebhook(body, `t=${t},v1=${sign(t)}`, SECRET)).resolves.toEqual(JSON.parse(body));
  });

  it("matches the Node HMAC implementation", async () => {
    expect(await computeSignature(SECRET, 1758704400, body)).toBe(sign(1758704400));
  });

  it("accepts when any of several v1 signatures matches, ignoring unknown parts", async () => {
    const t = now();
    const header = `t=${t},v0=zzz,junk,v1=${"0".repeat(64)},v1=${sign(t).toUpperCase()}`;
    await expect(verifyWebhook(body, header, SECRET)).resolves.toMatchObject({ id: "evt_1" });
  });

  it("rejects a tampered body and the wrong secret", async () => {
    const t = now();
    await expect(verifyWebhook(body.replace("msg_1", "msg_2"), `t=${t},v1=${sign(t)}`, SECRET)).rejects.toThrow(
      WebhookVerificationError,
    );
    await expect(verifyWebhook(body, `t=${t},v1=${sign(t, body, "whsec_other")}`, SECRET)).rejects.toThrow(
      /does not match/,
    );
    await expect(verifyWebhook(body, `t=${t},v1=abc`, SECRET)).rejects.toThrow(/does not match/);
  });

  it("rejects stale and future timestamps, honoring a custom tolerance", async () => {
    const old = now() - 301;
    await expect(verifyWebhook(body, `t=${old},v1=${sign(old)}`, SECRET)).rejects.toThrow(/tolerance/);
    const future = now() + 301;
    await expect(verifyWebhook(body, `t=${future},v1=${sign(future)}`, SECRET)).rejects.toThrow(/tolerance/);
    const t = now() - 400;
    await expect(verifyWebhook(body, `t=${t},v1=${sign(t)}`, SECRET, 600)).resolves.toMatchObject({ id: "evt_1" });
  });

  it("rejects missing or malformed headers and a missing secret", async () => {
    await expect(verifyWebhook(body, null, SECRET)).rejects.toThrow(/Missing Wuapi-Signature/);
    await expect(verifyWebhook(body, undefined, SECRET)).rejects.toThrow(/Missing Wuapi-Signature/);
    await expect(verifyWebhook(body, `t=${now()},v1=${sign(now())}`, "")).rejects.toThrow(/Missing webhook secret/);
    await expect(verifyWebhook(body, "v1=abc", SECRET)).rejects.toThrow(/Malformed/);
    await expect(verifyWebhook(body, `t=${now()}`, SECRET)).rejects.toThrow(/Malformed/);
    await expect(verifyWebhook(body, `t=abc,v1=${sign(now())}`, SECRET)).rejects.toThrow(/Malformed/);
  });

  it("rejects a body that is not JSON even when signed", async () => {
    const raw = "not json";
    const t = now();
    await expect(verifyWebhook(raw, `t=${t},v1=${sign(t, raw)}`, SECRET)).rejects.toThrow(/not valid JSON/);
  });

  it("needs WebCrypto", async () => {
    vi.stubGlobal("crypto", {});
    await expect(computeSignature(SECRET, 1, body)).rejects.toThrow(/WebCrypto is not available/);
  });
});
