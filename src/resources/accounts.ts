import { accountPath } from "../core.js";
import { WuapiError } from "../errors.js";
import type { Paginator } from "../pagination.js";
import type {
  Account,
  AccountCreateParams,
  AccountListParams,
  AccountPresenceState,
  AccountUpdateParams,
  CallOptions,
  DisappearingSeconds,
  PairingCode,
  ProxyLocationItem,
  ProxyLocationListParams,
} from "../types.js";
import { Resource } from "./base.js";

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

export class Accounts extends Resource {
  /** List accounts, newest first. Iterate with `for await` or call `.page()`. */
  list(params: AccountListParams = {}, options?: CallOptions): Paginator<Account, AccountListParams> {
    return this._list("/v1/accounts", params, (p) => ({ projectId: p.projectId }), options);
  }

  /**
   * Start linking a new number, exiting from `proxyLocation` (see
   * `proxyLocations.list()`). A new organization links its first account
   * with no card; after that it needs an active or trialing subscription
   * (402 otherwise). Pass `pairingPhone` to link by pairing code instead of QR
   * code, then `waitForPairingCode`. Chat history is imported only with
   * `historySync: "recent"`.
   */
  create(params: AccountCreateParams, options?: CallOptions): Promise<Account> {
    return this._post("/v1/accounts", params, options);
  }

  get(accountId: string, options?: CallOptions): Promise<Account> {
    return this._get(accountPath(accountId), undefined, options);
  }

  /**
   * Rename it, set automatic call rejection, tune its `pacing` (`null` resets
   * it), or change `historySync` for the next link.
   */
  update(accountId: string, params: AccountUpdateParams, options?: CallOptions): Promise<Account> {
    return this._patch(accountPath(accountId), params, options);
  }

  /** Unlink from the phone, delete the account and stop billing for it. */
  delete(accountId: string, options?: CallOptions): Promise<void> {
    return this._delete(accountPath(accountId), undefined, options);
  }

  /** Restart the session. Produces a fresh QR code when the link is no longer valid. */
  reconnect(accountId: string, options?: CallOptions): Promise<Account> {
    return this._post(accountPath(accountId, "/reconnect"), undefined, options);
  }

  /** Unlink from the phone and stop billing, keeping the account and its messages. */
  logout(accountId: string, options?: CallOptions): Promise<Account> {
    return this._post(accountPath(accountId, "/logout"), undefined, options);
  }

  /**
   * Request a pairing code to link by phone number instead of QR code. The
   * owner types it in WhatsApp > Linked devices > Link a device > Link with
   * phone number instead. It lives about 160 seconds. 409 `already_linked`
   * when the account is ready.
   */
  createPairingCode(accountId: string, params: { phone: string }, options?: CallOptions): Promise<PairingCode> {
    return this._post(accountPath(accountId, "/pairing-code"), params, options);
  }

  /** Show the account as online or offline to contacts. */
  setPresence(accountId: string, state: AccountPresenceState, options?: CallOptions): Promise<void> {
    return this._post(accountPath(accountId, "/presence"), { state }, options);
  }

  /** The disappearing-messages timer for new chats. 0 turns it off. */
  setDefaultDisappearingTimer(accountId: string, durationSeconds: DisappearingSeconds, options?: CallOptions): Promise<void> {
    return this._put(accountPath(accountId, "/disappearing-timer"), { durationSeconds }, options);
  }

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

export class ProxyLocations extends Resource {
  /**
   * Every supported `{country, city}` pair, ordered by country name, then by city population, largest first.
   * Filter with `country`, or search with `q` (`{ q: "sao" }` finds São Paulo); a search comes back best match first.
   */
  list(params: ProxyLocationListParams = {}, options?: CallOptions): Paginator<ProxyLocationItem, ProxyLocationListParams> {
    return this._list("/v1/proxy-locations", params, (p) => ({ country: p.country, q: p.q }), options);
  }
}
