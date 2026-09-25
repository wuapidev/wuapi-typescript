import { accountPath, enc } from "../core.js";
import type { Paginator } from "../pagination.js";
import type {
  CallOptions,
  Message,
  MessageDeleteParams,
  MessageListParams,
  SendMessageParams,
  StoryCreateParams,
} from "../types.js";
import { Resource } from "./base.js";

const path = (messageId: string, suffix = "") => `/v1/messages/${enc(messageId)}${suffix}`;

export class Messages extends Resource {
  /**
   * Queue a message to a contact, a group, or a channel you administer. It is
   * returned with `status: "queued"`; the outcome arrives as `message.sent` /
   * `message.failed` webhooks or via `get()`. An idempotency key is generated
   * when you pass none, so retries never send twice.
   */
  send(params: SendMessageParams, options?: CallOptions): Promise<Message> {
    return this._post("/v1/messages", params, options);
  }

  /** List messages, newest first. Iterate with `for await` or call `.page()`. */
  list(params: MessageListParams = {}, options?: CallOptions): Paginator<Message, MessageListParams> {
    return this._list(
      "/v1/messages",
      params,
      (p) => ({ accountId: p.accountId, chatId: p.chatId, direction: p.direction, projectId: p.projectId }),
      options,
    );
  }

  get(messageId: string, options?: CallOptions): Promise<Message> {
    return this._get(path(messageId), undefined, options);
  }

  /** Edit an outbound text message, within WhatsApp's edit window (about 15 minutes). Fires `message.edited`. */
  edit(messageId: string, text: string, options?: CallOptions): Promise<Message> {
    return this._patch(path(messageId), { text }, options);
  }

  /** Delete an outbound message, for everyone by default. */
  delete(messageId: string, params: MessageDeleteParams = {}, options?: CallOptions): Promise<void> {
    return this._delete(path(messageId), { forEveryone: params.forEveryone }, options);
  }

  /** React with an emoji. An empty string removes the reaction. */
  react(messageId: string, emoji: string, options?: CallOptions): Promise<void> {
    return this._post(path(messageId, "/react"), { emoji }, options);
  }

  /** Vote in a poll with the names of its options. `[]` retracts the vote. Returns the poll with its tally. */
  vote(messageId: string, pollOptions: string[], options?: CallOptions): Promise<Message> {
    return this._post(path(messageId, "/vote"), { options: pollOptions }, options);
  }

  star(messageId: string, options?: CallOptions): Promise<Message> {
    return this._post(path(messageId, "/star"), undefined, options);
  }

  unstar(messageId: string, options?: CallOptions): Promise<Message> {
    return this._post(path(messageId, "/unstar"), undefined, options);
  }

  /** WhatsApp Business accounts only. */
  addLabel(messageId: string, labelId: string, options?: CallOptions): Promise<void> {
    return this._post(path(messageId, "/labels"), { labelId }, options);
  }

  removeLabel(messageId: string, labelId: string, options?: CallOptions): Promise<void> {
    return this._delete(path(messageId, `/labels/${enc(labelId)}`), undefined, options);
  }
}

export class Stories extends Resource {
  /**
   * Post a story (a WhatsApp Status). Queued like a message and stored with
   * `chatId: "stories"`.
   */
  create(accountId: string, params: StoryCreateParams, options?: CallOptions): Promise<Message> {
    return this._post(accountPath(accountId, "/stories"), params, options);
  }
}
