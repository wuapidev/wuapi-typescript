// Hand-written: account helpers the spec cannot describe. The generated
// AccountsResource extends AccountsBase (see `bases` in wuapi.sdk.toml).

import type { CallOptions } from "../core.js";
import { WuapiError } from "../errors.js";
import { Resource } from "../resources/base.js";
import type { Account } from "../types.js";

export interface WaitOptions {
  /** Poll interval in milliseconds. Defaults to 2000. */
  intervalMs?: number;
  /** Give up after this many milliseconds. Defaults to 180000 (3 minutes). */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface WaitUntilReadyOptions extends WaitOptions {
  /** Called every time a new QR code appears (including rotations), with its PNG data URL. */
  onQrCode?: (qrCodeUrl: string, account: Account) => void;
  /** Called every time a new pairing code appears, for accounts linking by phone number. */
  onPairingCode?: (code: string, account: Account) => void;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error("Aborted"));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason ?? new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/** The hand-written part of `wuapi.accounts`: polling helpers for linking. */
export abstract class AccountsBase extends Resource {
  /** Get an account (generated). */
  abstract get(accountId: string, options?: CallOptions): Promise<Account>;

  /**
   * Poll until the account has a QR code to scan, and return it with
   * `qrCodeUrl` set. Returns the account as is if it is already `ready`.
   * Throws a `WuapiError` with code `account_failed` if it reaches `failed`,
   * or `wait_timeout` after `timeoutMs`.
   */
  waitForQrCode(accountId: string, options: WaitOptions = {}): Promise<Account> {
    return this.#poll(
      accountId,
      options,
      (account) => (account.status === "qr_ready" && account.qrCodeUrl !== null) || account.status === "ready",
    );
  }

  /**
   * Poll until the account has a pairing code to type on the phone. For
   * accounts created with `pairingPhone`, or after `createPairingCode()`.
   */
  waitForPairingCode(accountId: string, options: WaitOptions = {}): Promise<Account> {
    return this.#poll(accountId, options, (account) => account.pairingCode !== null || account.status === "ready");
  }

  /**
   * Poll until the account is `ready` and return it. `onQrCode` and
   * `onPairingCode` are told about each new code (they rotate while waiting).
   */
  waitUntilReady(accountId: string, options: WaitUntilReadyOptions = {}): Promise<Account> {
    let lastQr: string | null = null;
    let lastCode: string | null = null;
    return this.#poll(accountId, options, (account) => {
      if (account.status === "qr_ready" && account.qrCodeUrl && account.qrCodeUrl !== lastQr) {
        lastQr = account.qrCodeUrl;
        options.onQrCode?.(account.qrCodeUrl, account);
      }
      if (account.status !== "ready" && account.pairingCode && account.pairingCode !== lastCode) {
        lastCode = account.pairingCode;
        options.onPairingCode?.(account.pairingCode, account);
      }
      return account.status === "ready";
    });
  }

  async #poll(accountId: string, options: WaitOptions, done: (account: Account) => boolean): Promise<Account> {
    const interval = options.intervalMs ?? 2_000;
    const deadline = Date.now() + (options.timeoutMs ?? 180_000);
    for (;;) {
      const account = await this.get(accountId, options.signal ? { signal: options.signal } : undefined);
      if (done(account)) return account;
      if (account.status === "failed") {
        throw new WuapiError({
          status: 0,
          code: "account_failed",
          message: `Account ${accountId} failed${account.lastError ? `: ${account.lastError}` : ""}.`,
          details: { account },
        });
      }
      if (Date.now() + interval > deadline) {
        throw new WuapiError({
          status: 0,
          code: "wait_timeout",
          message: `Timed out waiting for account ${accountId}. Last status: ${account.status}.`,
          details: { account },
        });
      }
      await sleep(interval, options.signal);
    }
  }
}
