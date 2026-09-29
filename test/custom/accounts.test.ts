// Hand-written: the rest of src/custom/accounts.ts (the 0.4.0 suite in
// client.test.ts covers the main paths).
import { describe, expect, it, vi } from "vitest";
import { Wuapi, WuapiError } from "../../src/index.js";
import { account, mockFetch } from "./helpers.js";

const KEY = "wu_live_" + "a".repeat(48);

describe("account wait helpers, edges", () => {
  it("waitForPairingCode resolves on a pairing code and reports new codes to waitUntilReady", async () => {
    const { fetch } = mockFetch([
      { status: 200, body: account() },
      { status: 200, body: account({ pairingCode: "ABCD-1234" }) },
    ]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    const acc = await client.accounts.waitForPairingCode("acc_1", { intervalMs: 1 });
    expect(acc.pairingCode).toBe("ABCD-1234");

    const codes: string[] = [];
    const { fetch: fetch2 } = mockFetch([
      { status: 200, body: account({ pairingCode: "ABCD-1234" }) },
      { status: 200, body: account({ pairingCode: "ABCD-1234" }) },
      { status: 200, body: account({ pairingCode: "EFGH-5678" }) },
      { status: 200, body: account({ status: "ready", pairingCode: "EFGH-5678" }) },
    ]);
    const ready = await new Wuapi({ apiKey: KEY, fetch: fetch2 }).accounts.waitUntilReady("acc_1", {
      intervalMs: 1,
      onPairingCode: (code) => codes.push(code),
    });
    expect(ready.status).toBe("ready");
    expect(codes).toEqual(["ABCD-1234", "EFGH-5678"]);
  });

  it("returns at once for a ready account, and needs no callbacks", async () => {
    const { fetch } = mockFetch([
      { status: 200, body: account({ status: "ready" }) },
      { status: 200, body: account({ status: "ready" }) },
      { status: 200, body: account({ status: "qr_ready", qrCodeUrl: "data:A", pairingCode: "X" }) },
      { status: 200, body: account({ status: "ready" }) },
    ]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    expect((await client.accounts.waitForQrCode("acc_1")).status).toBe("ready");
    expect((await client.accounts.waitForPairingCode("acc_1")).status).toBe("ready");
    expect((await client.accounts.waitUntilReady("acc_1", { intervalMs: 1 })).status).toBe("ready");
  });

  it("names the failure without lastError, and times out with the last status", async () => {
    const { fetch } = mockFetch([
      { status: 200, body: account({ status: "failed" }) },
      { status: 200, body: account() },
    ]);
    const client = new Wuapi({ apiKey: KEY, fetch });
    await expect(client.accounts.waitUntilReady("acc_1")).rejects.toMatchObject({
      code: "account_failed",
      message: "Account acc_1 failed.",
    });
    const err = await client.accounts.waitUntilReady("acc_1", { intervalMs: 10, timeoutMs: 5 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WuapiError);
    expect(err).toMatchObject({ code: "wait_timeout", message: "Timed out waiting for account acc_1. Last status: initializing." });
  });

  it("stops waiting when the signal aborts, before or during the sleep", async () => {
    // Aborted after the poll answered, so the sleep sees it already aborted.
    const before = new AbortController();
    const { fetch } = mockFetch([{ status: 200, body: account() }]);
    const abortingFetch: typeof fetch = async (url, init) => {
      const res = await fetch(url, init);
      before.abort(new Error("stop"));
      return res;
    };
    await expect(
      new Wuapi({ apiKey: KEY, fetch: abortingFetch }).accounts.waitUntilReady("acc_1", { signal: before.signal }),
    ).rejects.toThrow("stop");

    const noReason = new AbortController();
    Object.defineProperty(noReason.signal, "reason", { value: undefined });
    const { fetch: fetch0 } = mockFetch([{ status: 200, body: account() }]);
    const abortingFetch0: typeof fetch0 = async (url, init) => {
      const res = await fetch0(url, init);
      noReason.abort();
      return res;
    };
    await expect(
      new Wuapi({ apiKey: KEY, fetch: abortingFetch0 }).accounts.waitForPairingCode("acc_1", { signal: noReason.signal }),
    ).rejects.toThrow("Aborted");

    const during = new AbortController();
    const { fetch: fetch2, calls } = mockFetch([{ status: 200, body: account() }]);
    const waiting = new Wuapi({ apiKey: KEY, fetch: fetch2 }).accounts.waitUntilReady("acc_1", {
      intervalMs: 60_000,
      signal: during.signal,
    });
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20)); // now sleeping
    during.abort();
    await expect(waiting).rejects.toThrow();

    const bare = new AbortController();
    const { fetch: fetch3, calls: calls3 } = mockFetch([{ status: 200, body: account() }]);
    const waiting3 = new Wuapi({ apiKey: KEY, fetch: fetch3 }).accounts.waitForQrCode("acc_1", {
      intervalMs: 60_000,
      signal: bare.signal,
    });
    await vi.waitFor(() => expect(calls3).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20)); // now sleeping
    Object.defineProperty(bare.signal, "reason", { value: undefined });
    bare.abort();
    await expect(waiting3).rejects.toThrow("Aborted");
  });
});
