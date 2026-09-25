import { accountPath, enc } from "../core.js";
import type {
  CallOptions,
  ChatId,
  ChatPresenceState,
  ChatRead,
  DisappearingSeconds,
  Label,
  LabelUpsertParams,
  ReadReceiptsParams,
} from "../types.js";
import { Resource } from "./base.js";

const chat = (accountId: string, chatId: ChatId, suffix = "") => accountPath(accountId, `/chats/${enc(chatId)}${suffix}`);

export class Chats extends Resource {
  /** Show (`typing`, `recording`) or clear (`paused`) the typing indicator in a chat. */
  sendPresence(accountId: string, chatId: ChatId, state: ChatPresenceState, options?: CallOptions): Promise<void> {
    return this._post(chat(accountId, chatId, "/presence"), { state }, options);
  }

  /** Send read receipts (blue ticks). Without `messageIds`, every unread inbound message wuapi stores for the chat. */
  sendReadReceipts(accountId: string, chatId: ChatId, params: ReadReceiptsParams = {}, options?: CallOptions): Promise<ChatRead> {
    return this._post(chat(accountId, chatId, "/read"), params, options);
  }

  /** Mark the chat read on the linked devices (the unread badge). Sends no receipts. */
  markRead(accountId: string, chatId: ChatId, options?: CallOptions): Promise<void> {
    return this._post(chat(accountId, chatId, "/mark-read"), undefined, options);
  }

  markUnread(accountId: string, chatId: ChatId, options?: CallOptions): Promise<void> {
    return this._post(chat(accountId, chatId, "/mark-unread"), undefined, options);
  }

  archive(accountId: string, chatId: ChatId, options?: CallOptions): Promise<void> {
    return this._post(chat(accountId, chatId, "/archive"), undefined, options);
  }

  unarchive(accountId: string, chatId: ChatId, options?: CallOptions): Promise<void> {
    return this._post(chat(accountId, chatId, "/unarchive"), undefined, options);
  }

  pin(accountId: string, chatId: ChatId, options?: CallOptions): Promise<void> {
    return this._post(chat(accountId, chatId, "/pin"), undefined, options);
  }

  unpin(accountId: string, chatId: ChatId, options?: CallOptions): Promise<void> {
    return this._post(chat(accountId, chatId, "/unpin"), undefined, options);
  }

  /** Mute for `durationSeconds`, or until unmuted when omitted or 0. */
  mute(accountId: string, chatId: ChatId, params: { durationSeconds?: number } = {}, options?: CallOptions): Promise<void> {
    return this._post(chat(accountId, chatId, "/mute"), params, options);
  }

  unmute(accountId: string, chatId: ChatId, options?: CallOptions): Promise<void> {
    return this._post(chat(accountId, chatId, "/unmute"), undefined, options);
  }

  /** Delete the chat on the linked devices. Messages stored in wuapi are kept. */
  delete(accountId: string, chatId: ChatId, params: { deleteMedia?: boolean } = {}, options?: CallOptions): Promise<void> {
    return this._delete(chat(accountId, chatId), { deleteMedia: params.deleteMedia }, options);
  }

  /** The chat's disappearing-messages timer. 0 turns it off. */
  setDisappearingTimer(accountId: string, chatId: ChatId, durationSeconds: DisappearingSeconds, options?: CallOptions): Promise<void> {
    return this._put(chat(accountId, chatId, "/disappearing-timer"), { durationSeconds }, options);
  }

  /** WhatsApp Business accounts only. */
  addLabel(accountId: string, chatId: ChatId, labelId: string, options?: CallOptions): Promise<void> {
    return this._post(chat(accountId, chatId, "/labels"), { labelId }, options);
  }

  removeLabel(accountId: string, chatId: ChatId, labelId: string, options?: CallOptions): Promise<void> {
    return this._delete(chat(accountId, chatId, `/labels/${enc(labelId)}`), undefined, options);
  }
}

export class Labels extends Resource {
  /** Create or edit a WhatsApp Business label. Reuse an id to edit it. */
  upsert(accountId: string, labelId: string, params: LabelUpsertParams, options?: CallOptions): Promise<Label> {
    return this._put(accountPath(accountId, `/labels/${enc(labelId)}`), params, options);
  }

  delete(accountId: string, labelId: string, options?: CallOptions): Promise<void> {
    return this._delete(accountPath(accountId, `/labels/${enc(labelId)}`), undefined, options);
  }
}
