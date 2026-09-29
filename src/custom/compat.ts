// Hand-written: names @wuapidev/sdk 0.4.0 exported that the generated SDK
// spells differently. They stay so existing code keeps compiling. New code
// can use either name; they are the same types.

import type { ProjectsApiKeysResource, ProjectsResource } from "../resources/projects.js";
import type { AccountsResource } from "../resources/accounts.js";
import type { BotsResource } from "../resources/bots.js";
import type { CallsResource } from "../resources/calls.js";
import type { ChannelsResource } from "../resources/channels.js";
import type { ChatsResource } from "../resources/chats.js";
import type { ContactsResource } from "../resources/contacts.js";
import type { GroupsResource } from "../resources/groups.js";
import type { InvitationsResource } from "../resources/invitations.js";
import type { LabelsResource } from "../resources/labels.js";
import type { MessagesResource } from "../resources/messages.js";
import type { OrdersResource } from "../resources/orders.js";
import type { PrivacyResource } from "../resources/privacy.js";
import type { ProfileResource } from "../resources/profile.js";
import type { ProxyLocationsResource } from "../resources/proxy-locations.js";
import type { StickerPacksResource } from "../resources/sticker-packs.js";
import type { StoriesResource } from "../resources/stories.js";
import type { WebhookEndpointsResource } from "../resources/webhook-endpoints.js";
import type * as T from "../types.js";

// Resource classes.
export type Accounts = AccountsResource;
export type ProxyLocations = ProxyLocationsResource;
export type Messages = MessagesResource;
export type Stories = StoriesResource;
export type Chats = ChatsResource;
export type Labels = LabelsResource;
export type Contacts = ContactsResource;
export type Bots = BotsResource;
export type Profile = ProfileResource;
export type Privacy = PrivacyResource;
export type Calls = CallsResource;
export type StickerPacks = StickerPacksResource;
export type Orders = OrdersResource;
export type Groups = GroupsResource;
export type Channels = ChannelsResource;
export type WebhookEndpoints = WebhookEndpointsResource;
export type Projects = ProjectsResource;
export type ProjectApiKeys = ProjectsApiKeysResource;
export type Invitations = InvitationsResource;

// Ids.
/** A chat: a contact id, a group id (`...@g.us`), a channel id or `stories`. */
export type ChatId = string;
/** A contact: E.164 with `+`, or `lid:<digits>`. */
export type ContactId = string;

// Params.
export type AccountListParams = T.AccountsListParams;
export type AccountCreateParams = T.AccountsCreateParams;
export type AccountUpdateParams = T.AccountsUpdateParams;
export type AccountPresenceState = T.AccountPresenceRequestState;
export type ProxyLocationListParams = T.ProxyLocationsListParams;
/** The request shape of a proxy location: `strictCity` is optional. */
export type ProxyLocation = T.ProxyLocationInput;
export type SendMessageParams = T.MessagesSendParams;
export type SendTextMessageParams = T.SendTextMessageRequest;
export type SendImageMessageParams = T.SendImageMessageRequest;
export type SendVideoMessageParams = T.SendVideoMessageRequest;
export type SendAudioMessageParams = T.SendAudioMessageRequest;
export type SendVoiceMessageParams = T.SendVoiceMessageRequest;
export type SendDocumentMessageParams = T.SendDocumentMessageRequest;
export type SendStickerMessageParams = T.SendStickerMessageRequest;
export type SendLocationMessageParams = T.SendLocationMessageRequest;
export type SendContactMessageParams = T.SendContactMessageRequest;
export type SendContactsMessageParams = T.SendContactsMessageRequest;
export type SendPollMessageParams = T.SendPollMessageRequest;
export type SendCalendarEventMessageParams = T.SendCalendarEventMessageRequest;
/** Every `type` a message can be sent as. */
export type SendType = NonNullable<T.MessagesSendParams["type"]>;
/** The fields every send shares. */
export type SendMessageBase = Pick<
  T.SendTextMessageRequest,
  "accountId" | "to" | "mentions" | "mentionAll" | "forwarded" | "disappearingSeconds" | "replyToMessageId" | "metadata"
>;
export type MessageListParams = T.MessagesListParams;
export type MessageDeleteParams = T.MessagesDeleteParams;
export type StoryCreateParams = T.StoriesCreateParams;
export type TextStoryCreateParams = T.TextStoryCreateRequest;
export type MediaStoryCreateParams = T.MediaStoryCreateRequest;
export type ReadReceiptsParams = T.ChatsSendReadReceiptsParams;
export type LabelUpsertParams = T.LabelsUpsertParams;
export type LinkResolveParams = T.ContactsResolveLinkParams;
export type PictureInput = T.PictureUploadRequest;
export type GroupCreateParams = T.GroupsCreateParams;
export type GroupUpdateParams = T.GroupsUpdateParams;
export type ChannelCreateParams = T.ChannelsCreateParams;
export type WebhookEndpointCreateParams = T.WebhookEndpointsCreateParams;
export type WebhookEndpointUpdateParams = T.WebhookEndpointsUpdateParams;
/** A list filtered by project: `projectId`, `limit`, `cursor`. */
export type ProjectListParams = T.WebhookEndpointsListParams;
export type ProjectListFilter = T.ProjectsListParams;
export type ProjectCreateParams = T.ProjectsCreateParams;
export type ProjectUpdateParams = T.ProjectsUpdateParams;
export type ApiKeyCreateParams = T.ProjectsApiKeysCreateParams;
export type InvitationCreateParams = T.InvitationsCreateParams;
export type InvitationListParams = T.InvitationsListParams;
/** `month` (`YYYY-MM`) for usage reports. */
export type MonthParams = T.UsageByProjectParams;

// Models.
export type ContactCard = T.MessageContact;
export type ErrorBody = T.ApiError;
export type UsagePeriod = T.Period;
