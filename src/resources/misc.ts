import { accountPath, enc } from "../core.js";
import type { CallOptions, Order, StickerPack } from "../types.js";
import { Resource } from "./base.js";

export class Calls extends Resource {
  /**
   * Reject an incoming call: `callId` and `from` come from `call.received`.
   * For automatic rejection set `rejectCalls` on the account.
   */
  reject(accountId: string, callId: string, params: { from: string }, options?: CallOptions): Promise<void> {
    return this._post(accountPath(accountId, `/calls/${enc(callId)}/reject`), params, options);
  }
}

export class StickerPacks extends Resource {
  get(accountId: string, stickerPackId: string, options?: CallOptions): Promise<StickerPack> {
    return this._get(accountPath(accountId, `/sticker-packs/${enc(stickerPackId)}`), undefined, options);
  }
}

export class Orders extends Resource {
  /** A catalog order received as a message. `token` comes from the order message. */
  get(accountId: string, orderId: string, params: { token: string }, options?: CallOptions): Promise<Order> {
    return this._get(accountPath(accountId, `/orders/${enc(orderId)}`), { token: params.token }, options);
  }
}
