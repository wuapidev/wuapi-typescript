import { accountPath, enc } from "../core.js";
import type { Paginator } from "../pagination.js";
import type { CallOptions, Channel, ChannelCreateParams, ChannelMessage, ListParams } from "../types.js";
import { Resource } from "./base.js";

const channels = (accountId: string, suffix = "") => accountPath(accountId, `/channels${suffix}`);
const channel = (accountId: string, channelId: string, suffix = "") => channels(accountId, `/${enc(channelId)}${suffix}`);

/** WhatsApp channels. To post to one you administer, use `messages.send` with `to` set to the channel id. */
export class Channels extends Resource {
  /** Channels the account follows. */
  list(accountId: string, params: ListParams = {}, options?: CallOptions): Paginator<Channel, ListParams> {
    return this._list(channels(accountId), params, undefined, options);
  }

  create(accountId: string, params: ChannelCreateParams, options?: CallOptions): Promise<Channel> {
    return this._post(channels(accountId), params, options);
  }

  get(accountId: string, channelId: string, options?: CallOptions): Promise<Channel> {
    return this._get(channel(accountId, channelId), undefined, options);
  }

  /** The channel behind an invite code (`https://whatsapp.com/channel/<code>`). */
  getInvite(accountId: string, code: string, options?: CallOptions): Promise<Channel> {
    return this._get(channels(accountId, `/invites/${enc(code)}`), undefined, options);
  }

  follow(accountId: string, channelId: string, options?: CallOptions): Promise<void> {
    return this._post(channel(accountId, channelId, "/follow"), undefined, options);
  }

  unfollow(accountId: string, channelId: string, options?: CallOptions): Promise<void> {
    return this._post(channel(accountId, channelId, "/unfollow"), undefined, options);
  }

  mute(accountId: string, channelId: string, options?: CallOptions): Promise<void> {
    return this._post(channel(accountId, channelId, "/mute"), undefined, options);
  }

  unmute(accountId: string, channelId: string, options?: CallOptions): Promise<void> {
    return this._post(channel(accountId, channelId, "/unmute"), undefined, options);
  }

  /** The channel's messages, newest first, read from WhatsApp. */
  listMessages(accountId: string, channelId: string, params: ListParams = {}, options?: CallOptions): Paginator<ChannelMessage, ListParams> {
    return this._list(channel(accountId, channelId, "/messages"), params, undefined, options);
  }

  /** React to a channel message. An empty string removes the reaction. */
  react(accountId: string, channelId: string, channelMessageId: string, emoji: string, options?: CallOptions): Promise<void> {
    return this._post(channel(accountId, channelId, `/messages/${enc(channelMessageId)}/react`), { emoji }, options);
  }

  markViewed(accountId: string, channelId: string, channelMessageIds: string[], options?: CallOptions): Promise<void> {
    return this._post(channel(accountId, channelId, "/mark-viewed"), { channelMessageIds }, options);
  }
}
