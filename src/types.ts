/**
 * Types matching the wuapi REST API (https://wuapi.dev/openapi.json).
 *
 * Every resource carries `object` naming its type. Timestamps are ISO 8601
 * strings in UTC named `…At`. Contacts are E.164 (`+584241112233`), or
 * `lid:<digits>` when WhatsApp hides the number. Groups are `…@g.us`,
 * channels `…@newsletter`, and the account's stories are the chat `stories`.
 */

// ---------- common ----------

export interface ErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/** Every list: one page of items. */
export interface Page<T> {
  object: "list";
  items: T[];
  /** Pass as `cursor` to get the next page. `null` on the last page. */
  nextCursor: string | null;
}

export interface ListParams {
  /** Page size, 1-100. Defaults to 50. */
  limit?: number;
  /** Cursor from a previous page's `nextCursor`. */
  cursor?: string;
}

export interface ProjectListParams extends ListParams {
  /**
   * Filter by project: a project id, `ext:<externalId>`, or `none` for
   * unassigned resources only. A project-scoped client always lists its own
   * project.
   */
  projectId?: string;
}

/** Options every method accepts as its last argument. */
export interface CallOptions {
  /**
   * Sent as the `Idempotency-Key` header. POSTs get a random key when you do
   * not pass one, so automatic retries never repeat a send or a create. Pass
   * your own to make retries across processes safe too.
   */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/** A contact id: E.164 (`+584241112233`), bare digits, or `lid:<digits>`. */
export type ContactId = string;

/** A chat: a contact id, a group id (`…@g.us`), a channel id (`…@newsletter`), or `stories`. */
export type ChatId = string;

// ---------- organization, keys, projects ----------

export interface Organization {
  object: "organization";
  id: string;
  name: string;
}

export interface ApiKey {
  object: "api_key";
  id: string;
  name: string;
  projectId: string | null;
  keyPrefix: string;
  last4: string;
  /** The key itself. Only on the response that created it. */
  key?: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface AuthContext {
  object: "auth_context";
  organization: Organization;
  apiKey: ApiKey;
  /** The project this request is scoped to, or `null` for the whole organization. */
  project: Project | null;
}

export type ProjectStatus = "active" | "suspended";

export interface Project {
  object: "project";
  id: string;
  name: string;
  /** Your own id for this customer, unique among live projects. */
  externalId: string | null;
  metadata: Record<string, string>;
  status: ProjectStatus;
  /** Account limit. `null` means no limit. */
  maxAccounts: number | null;
  accountCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCreateParams {
  name: string;
  externalId?: string;
  metadata?: Record<string, string>;
  maxAccounts?: number;
}

export interface ProjectUpdateParams {
  name?: string;
  /** `null` clears it. */
  externalId?: string | null;
  /** Replaces the whole metadata object. */
  metadata?: Record<string, string>;
  /** `null` removes the limit. */
  maxAccounts?: number | null;
  status?: ProjectStatus;
}

export interface ProjectListFilter extends ListParams {
  /** Exact match. */
  externalId?: string;
  status?: ProjectStatus;
}

export interface ApiKeyCreateParams {
  name: string;
}

export interface UsagePeriod {
  startsAt: string;
  endsAt: string;
}

export interface Usage {
  object: "usage";
  period: UsagePeriod;
  currency: "usd";
  billableAccountCount: number;
  accountUnitPriceCents: number;
  accountFeeCents: number;
  /** Every proxy byte used this month, included or not. */
  proxyBytes: number;
  /** The month's pooled allowance: 0.5 GB per billable account, at the month's peak count. */
  includedProxyBytes: number;
  /** Proxy bytes past the allowance, trial traffic excluded: what `proxyFeeCents` bills. */
  billableProxyBytes: number;
  proxyFeeCents: number;
  totalCents: number;
}

export interface UsageLine {
  billableAccountCount: number;
  accountCount: number;
  proxyBytes: number;
  sentMessageCount: number;
  receivedMessageCount: number;
}

export interface UsageReport {
  object: "usage_report";
  period: UsagePeriod;
  projects: Array<UsageLine & { projectId: string; externalId: string | null; name: string }>;
  unassigned: UsageLine;
  totals: UsageLine;
}

export interface ProjectUsage extends UsageLine {
  object: "project_usage";
  projectId: string;
  period: UsagePeriod;
}

export interface MonthParams {
  /** `YYYY-MM` in UTC. Defaults to the current month. */
  month?: string;
}

export interface Branding {
  object: "branding";
  displayName: string | null;
  logoUrl: string | null;
  accentColor: string | null;
  supportUrl: string | null;
  hideWuapiBranding: boolean;
}

export interface BrandingUpdateParams {
  displayName?: string;
  logoUrl?: string | null;
  accentColor?: string | null;
  supportUrl?: string | null;
  /** `true` needs the White label add-on (402 `addon_required` otherwise). */
  hideWuapiBranding?: boolean;
}

// ---------- proxy locations ----------

/** Where an account's residential proxy exits. Values come from `proxyLocations.list()`. */
export interface ProxyLocation {
  /** ISO 3166-1 alpha-2, uppercase: `"CL"`. */
  country: string;
  /** City code from `proxyLocations.list()`: lowercase, one word, accents kept: `"santiago"`, `"bogotá"`. The unaccented form is accepted too. */
  city: string;
}

export interface ProxyLocationItem {
  object: "proxy_location";
  country: string;
  countryName: string;
  city: string;
  cityName: string;
}

export interface ProxyLocationListParams extends ListParams {
  /** Only this country (ISO 3166-1 alpha-2). */
  country?: string;
  /**
   * Search text, 1 to 100 characters: city name, city code, country name or ISO code, ignoring case and accents.
   * Results come best first: exact, then prefix (`"bogo"` finds Bogotá), then a later word (`"york"`), then anywhere; ties go to the bigger city.
   */
  q?: string;
}

// ---------- accounts ----------

export type AccountStatus = "initializing" | "qr_ready" | "authenticating" | "ready" | "disconnected" | "failed";

/** Effective pacing of an account. Defaults: 12/min, 5/min to first contacts, typing 800 to 6000 ms at 25 chars/s, 60 min queue timeout. */
export interface AccountPacing {
  messagesPerMinute: number;
  firstContactPerMinute: number;
  typing: { enabled: boolean; minMs: number; maxMs: number; charsPerSecond: number };
  queueTimeoutMinutes: number;
  /** `true` when any value differs from the defaults. */
  custom: boolean;
}

/** A pacing change, merged over the stored values. `null` on a field resets it to the default. */
export interface AccountPacingUpdate {
  messagesPerMinute?: number | null;
  firstContactPerMinute?: number | null;
  typing?: {
    enabled?: boolean | null;
    minMs?: number | null;
    maxMs?: number | null;
    charsPerSecond?: number | null;
  } | null;
  queueTimeoutMinutes?: number | null;
}

/**
 * Whether an account imports the recent chats the phone sends once, right
 * after the number links. `none` (the default) imports nothing; `recent`
 * stores them with `source: "history"` and fires `history.synced`.
 */
export type HistorySyncSetting = "none" | "recent";

export interface Account {
  object: "account";
  id: string;
  projectId: string | null;
  name: string | null;
  status: AccountStatus;
  /** Linked number in E.164, once known. */
  phone: string | null;
  /** The linked number's WhatsApp display name. */
  profileName: string | null;
  /** Where the account's proxy exits. `null` on accounts linked before proxy locations existed. */
  proxyLocation: ProxyLocation | null;
  /** PNG data URL of the QR code, while `status` is `qr_ready` and the account links by QR code. */
  qrCodeUrl: string | null;
  /** Pairing code (`XXXX-XXXX`) for accounts linking by phone number. `null` once `ready`. */
  pairingCode: string | null;
  pairingCodeExpiresAt: string | null;
  billable: boolean;
  disconnectReason: string | null;
  lastError: string | null;
  rejectCalls: boolean;
  rejectCallsMessage: string | null;
  pacing: AccountPacing;
  /** History import. Applies to the next link: a linked number gets no new history. */
  historySync: HistorySyncSetting;
  metadata: Record<string, string>;
  linkedAt: string | null;
  lastConnectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountListParams extends ProjectListParams {}

export interface AccountCreateParams {
  /** Required. Where the account's residential proxy exits; one of `proxyLocations.list()`. 400 `unsupported_proxy_location` otherwise. */
  proxyLocation: ProxyLocation;
  name?: string;
  /** Link by pairing code instead of QR code: the number to link. The code appears as `account.pairingCode`. */
  pairingPhone?: string;
  /** Organization keys only: create the account in this project (id or `ext:<externalId>`). */
  projectId?: string;
  /** `recent` imports the chats the phone sends once, right after linking. Default `none`. */
  historySync?: HistorySyncSetting;
}

export interface AccountUpdateParams {
  name?: string;
  rejectCalls?: boolean;
  /** Sent to the caller after an automatic reject. At most 1000 characters. */
  rejectCallsMessage?: string;
  /** `null` resets every value to the default. */
  pacing?: AccountPacingUpdate | null;
  /**
   * Import history at the next link, or not. WhatsApp sends history once,
   * right after linking: a number that is already linked gets none, not even
   * after a reconnect.
   */
  historySync?: HistorySyncSetting;
}

export interface PairingCode {
  object: "pairing_code";
  accountId: string;
  /** Type this on the phone: Linked devices > Link a device > Link with phone number instead. */
  code: string;
  expiresAt: string | null;
}

export type AccountPresenceState = "online" | "offline";
export type ChatPresenceState = "typing" | "recording" | "paused";
export type DisappearingSeconds = 0 | 86400 | 604800 | 7776000;

// ---------- messages ----------

export type ChatType = "direct" | "group" | "channel" | "story";
export type MessageDirection = "inbound" | "outbound";
export type MessageSource = "api" | "phone" | "contact" | "history";
export type MessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "voice"
  | "document"
  | "sticker"
  | "location"
  | "contact"
  | "contacts"
  | "poll"
  | "reaction"
  | "calendar_event"
  | "unknown";
export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed" | "received";

export interface MessageMedia {
  url: string | null;
  mimeType: string | null;
  filename: string | null;
}

export interface MessageLocation {
  latitude: number;
  longitude: number;
  name: string | null;
  address: string | null;
}

export interface ContactCard {
  name: string;
  /** E.164. */
  phone: string;
}

export interface MessagePoll {
  name: string;
  options: Array<{ name: string; voteCount: number }>;
  /** 0 means any number of options. */
  selectableCount: number;
  voterCount: number;
}

export interface MessageCalendarEvent {
  name: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  location: { name: string | null; address: string | null; latitude: number | null; longitude: number | null } | null;
  callType: "audio" | "video" | null;
  joinUrl: string | null;
  allowExtraGuests: boolean;
  cancelled: boolean;
}

export interface Message {
  object: "message";
  id: string;
  projectId: string | null;
  accountId: string;
  chatId: ChatId;
  chatType: ChatType;
  direction: MessageDirection;
  source: MessageSource;
  from: string;
  to: string;
  /** The sender's WhatsApp display name, on inbound messages. */
  profileName: string | null;
  type: MessageType;
  /** Text, caption of media, or the emoji of a reaction. */
  text: string | null;
  media: MessageMedia | null;
  location: MessageLocation | null;
  contact: ContactCard | null;
  contacts: ContactCard[] | null;
  poll: MessagePoll | null;
  calendarEvent: MessageCalendarEvent | null;
  mentions: ContactId[];
  forwarded: boolean;
  viewOnce: boolean;
  starred: boolean;
  replyToMessageId: string | null;
  status: MessageStatus;
  error: { code: string; message: string } | null;
  metadata: Record<string, string>;
  /** WhatsApp's timestamp. */
  sentAt: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SendMedia {
  /** https URL our servers fetch. */
  url: string;
  /** Guessed from the URL extension when omitted. Voice notes: send ogg/opus, nothing is transcoded. */
  mimeType?: string;
  filename?: string;
}

export interface SendVideoMedia extends SendMedia {
  /** Play it as a GIF. */
  gifPlayback?: boolean;
}

export interface SendLocation {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface SendPoll {
  name: string;
  /** 2 to 12 unique, non-blank options of at most 100 characters. */
  options: string[];
  /** How many options a voter may pick. 0 (default) means any number. */
  selectableCount?: number;
}

export interface SendCalendarEvent {
  name: string;
  description?: string;
  /** ISO 8601. */
  startsAt: string;
  /** Not before `startsAt`. */
  endsAt?: string;
  location?: { name: string; latitude?: number; longitude?: number };
  /** Make it a scheduled WhatsApp call. WhatsApp generates the call link. */
  callType?: "audio" | "video";
  allowExtraGuests?: boolean;
}

export interface SendLinkPreview {
  url: string;
  title: string;
  description?: string;
  /** JPEG, base64. */
  thumbnailBase64?: string;
}

/** Fields every send type takes. */
export interface SendMessageBase {
  /** The account to send from. It must be `ready`. */
  accountId: string;
  /**
   * A contact id, a group id (`…@g.us`) or a channel id (`…@newsletter`,
   * admins only). Channels take only `text`, `image`, `video` and `document`.
   */
  to: string;
  /** Contact ids to mention. Not for channel posts. */
  mentions?: ContactId[];
  /** Groups only: mention every participant. */
  mentionAll?: boolean;
  forwarded?: boolean;
  disappearingSeconds?: DisappearingSeconds;
  /** A wuapi message id in the same chat to quote. Not for channel posts. */
  replyToMessageId?: string;
  metadata?: Record<string, string>;
}

/** A text message. `type` may be omitted: the API sends a body without one as text. */
export interface SendTextMessageParams extends SendMessageBase {
  type?: "text";
  /** Not blank; at most 4096 characters. */
  text: string;
  linkPreview?: SendLinkPreview;
}

export interface SendImageMessageParams extends SendMessageBase {
  type: "image";
  media: SendMedia;
  /** Caption. */
  text?: string;
  viewOnce?: boolean;
}

export interface SendVideoMessageParams extends SendMessageBase {
  type: "video";
  media: SendVideoMedia;
  /** Caption. */
  text?: string;
  viewOnce?: boolean;
}

export interface SendAudioMessageParams extends SendMessageBase {
  type: "audio";
  media: SendMedia;
  /** Caption. */
  text?: string;
  viewOnce?: boolean;
}

/** An audio sent as a voice note. Send ogg/opus: nothing is transcoded. */
export interface SendVoiceMessageParams extends SendMessageBase {
  type: "voice";
  media: SendMedia;
  /** Caption. */
  text?: string;
  viewOnce?: boolean;
}

export interface SendDocumentMessageParams extends SendMessageBase {
  type: "document";
  media: SendMedia;
  /** Caption. */
  text?: string;
}

export interface SendStickerMessageParams extends SendMessageBase {
  type: "sticker";
  media: SendMedia;
  /** Caption. */
  text?: string;
}

export interface SendLocationMessageParams extends SendMessageBase {
  type: "location";
  location: SendLocation;
}

export interface SendContactMessageParams extends SendMessageBase {
  type: "contact";
  contact: ContactCard;
}

export interface SendContactsMessageParams extends SendMessageBase {
  type: "contacts";
  /** 2 to 20 cards. Use `type: "contact"` for one. */
  contacts: ContactCard[];
}

export interface SendPollMessageParams extends SendMessageBase {
  type: "poll";
  poll: SendPoll;
}

export interface SendCalendarEventMessageParams extends SendMessageBase {
  type: "calendar_event";
  calendarEvent: SendCalendarEvent;
}

/**
 * What `messages.send()` takes, discriminated by `type`: each type requires
 * its own field (`text`, `media`, `location`, `contact`, `contacts`, `poll` or
 * `calendarEvent`). Mirrors `SendMessageRequest` in openapi.json.
 */
export type SendMessageParams =
  | SendTextMessageParams
  | SendImageMessageParams
  | SendVideoMessageParams
  | SendAudioMessageParams
  | SendVoiceMessageParams
  | SendDocumentMessageParams
  | SendStickerMessageParams
  | SendLocationMessageParams
  | SendContactMessageParams
  | SendContactsMessageParams
  | SendPollMessageParams
  | SendCalendarEventMessageParams;

export type SendType = NonNullable<SendMessageParams["type"]>;

export interface MessageListParams extends ProjectListParams {
  accountId?: string;
  chatId?: ChatId;
  direction?: MessageDirection;
}

export interface MessageDeleteParams {
  /** `false` deletes on the linked devices only. Default `true`. */
  forEveryone?: boolean;
}

/** A text story. `type` may be omitted: the API posts a body without one as text. */
export interface TextStoryCreateParams {
  type?: "text";
  /** Not blank; at most 4096 characters. */
  text: string;
  /** `#RRGGBB`. */
  backgroundColor?: string;
  /** WhatsApp's story font: 0, 1, 2, 6, 7, 8, 9 or 10. */
  font?: 0 | 1 | 2 | 6 | 7 | 8 | 9 | 10;
}

/** An image or video story. */
export interface MediaStoryCreateParams {
  type: "image" | "video";
  media: { url: string; mimeType?: string };
  /** Caption. */
  text?: string;
}

/** What `stories.create()` takes, discriminated by `type`. Mirrors `StoryCreateRequest` in openapi.json. */
export type StoryCreateParams = TextStoryCreateParams | MediaStoryCreateParams;

// ---------- chats ----------

export interface ChatRead {
  object: "chat_read";
  accountId: string;
  chatId: ChatId;
  messageCount: number;
}

export interface ReadReceiptsParams {
  /** wuapi message ids in this chat. Default: every unread inbound message wuapi stores for it. */
  messageIds?: string[];
}

export interface Label {
  object: "label";
  id: string;
  accountId: string;
  name: string;
  color: number;
}

export interface LabelUpsertParams {
  name: string;
  /** 0 to 19. */
  color?: number;
}

// ---------- contacts, profile, privacy ----------

export interface ContactCheck {
  object: "contact_check";
  phone: string;
  onWhatsApp: boolean;
  contactId: ContactId | null;
  businessName: string | null;
}

export interface Contact {
  object: "contact";
  id: ContactId;
  accountId: string;
  lid: string | null;
  about: string | null;
  pictureId: string | null;
  businessName: string | null;
  deviceCount: number | null;
}

export interface Picture {
  object: "picture";
  id: string | null;
  url: string | null;
  preview: boolean;
}

export type PictureInput = { url: string } | { base64: string };

export interface BusinessProfile {
  object: "business_profile";
  contactId: ContactId;
  address: string | null;
  email: string | null;
  categories: Array<{ id: string; name: string }>;
  profileOptions: Record<string, string>;
  timeZone: string | null;
  businessHours: Array<{ dayOfWeek: string; mode: string; openTime: string | null; closeTime: string | null }>;
}

export interface BlockedContact {
  object: "blocked_contact";
  contactId: ContactId;
}

export interface ContactLink {
  object: "contact_link";
  url: string | null;
}

export interface ResolvedLink {
  object: "resolved_link";
  kind: "contact" | "business";
  contactId: ContactId | null;
  type: string | null;
  profileName: string | null;
  businessName: string | null;
  verifiedLevel: string | null;
  prefilledText: string | null;
}

export interface LinkResolveParams {
  kind: "contact" | "business";
  /** The code or the full link. */
  code: string;
}

export interface Bot {
  object: "bot";
  id: string;
  personaId: string | null;
  name: string | null;
  description: string | null;
  category: string | null;
  default: boolean;
  prompts: string[];
  commands: Array<{ name: string; description: string | null }>;
}

export interface ProfileUpdateParams {
  /** At most 139 characters. */
  about?: string;
  /** At most 25 characters. */
  name?: string;
}

export interface PrivacySettings {
  object: "privacy_settings";
  groupAdd: string | null;
  lastSeen: string | null;
  stories: string | null;
  profile: string | null;
  readReceipts: string | null;
  online: string | null;
  callAdd: string | null;
  messages: string | null;
  defense: string | null;
  stickers: string | null;
}

export interface PrivacyUpdateParams {
  groupAdd?: string;
  lastSeen?: string;
  stories?: string;
  profile?: string;
  readReceipts?: string;
  online?: string;
  callAdd?: string;
  messages?: string;
}

export interface StoryPrivacy {
  object: "story_privacy";
  lists: Array<{ type: "contacts" | "blacklist" | "whitelist"; contactIds: ContactId[]; default: boolean }>;
}

export interface StickerPack {
  object: "sticker_pack";
  id: string;
  name: string;
  publisher: string;
  description: string | null;
  animated: boolean;
  trayImageId: string | null;
  stickers: Array<{
    url: string | null;
    directPath: string | null;
    sizeBytes: number;
    mimeType: string;
    width: number;
    height: number;
    emojis: string[];
  }>;
}

export interface Order {
  object: "order";
  id: string;
  currency: string;
  subtotalCents: number;
  totalCents: number;
  products: Array<{ id: string; name: string; quantity: number; priceCents: number; currency: string; imageUrl: string | null }>;
  createdAt: string | null;
}

// ---------- groups ----------

export interface GroupParticipant {
  contactId: ContactId;
  name: string | null;
  role: "member" | "admin" | "owner";
}

export interface Group {
  object: "group";
  id: string;
  accountId: string;
  name: string;
  description: string | null;
  ownerId: ContactId | null;
  community: boolean;
  locked: boolean;
  announce: boolean;
  participants: GroupParticipant[];
  createdAt: string | null;
}

export interface GroupCreateParams {
  name: string;
  /** Contact ids. Required unless `community` is true. */
  participants?: ContactId[];
  /** Create a community instead of a group. */
  community?: boolean;
}

export interface GroupUpdateParams {
  name?: string;
  description?: string;
  /** Only admins can send. */
  announce?: boolean;
  /** Only admins can edit the group info. */
  locked?: boolean;
  /** New members need admin approval. */
  joinApproval?: boolean;
  memberAddMode?: "admins" | "all_members";
}

export interface ParticipantResult {
  object: "participant_result";
  contactId: ContactId;
  /** Why it failed for this participant, e.g. `privacy_restricted`. `null` when done. */
  error: string | null;
  /** Returned instead of an add when the person must be invited. */
  inviteCode: string | null;
}

export interface GroupJoin {
  object: "group_join";
  accountId: string;
  groupId: string;
}

export interface GroupInviteLink {
  object: "group_invite_link";
  groupId: string;
  url: string;
}

export interface GroupJoinRequest {
  object: "group_join_request";
  accountId: string;
  groupId: string;
  contactId: ContactId;
  requestedAt: string | null;
}

export interface Subgroup {
  object: "subgroup";
  id: string;
  name: string;
  default: boolean;
}

export interface CommunityParticipant {
  object: "community_participant";
  contactId: ContactId;
}

// ---------- channels ----------

export interface Channel {
  object: "channel";
  id: string;
  accountId: string;
  name: string;
  description: string | null;
  inviteCode: string | null;
  subscriberCount: number;
  verified: boolean;
  status: string | null;
  role: string | null;
  muted: boolean;
  pictureUrl: string | null;
  previewUrl: string | null;
  createdAt: string | null;
}

export interface ChannelCreateParams {
  name: string;
  description?: string;
  /** JPEG, base64. */
  pictureBase64?: string;
}

export interface ChannelMessage {
  object: "channel_message";
  id: string;
  accountId: string;
  channelId: string;
  type: string;
  text: string | null;
  viewCount: number | null;
  /** Count per emoji. */
  reactions: Record<string, number>;
  sentAt: string | null;
}

// ---------- invitations ----------

export type InvitationStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "expired";
export type InvitationMethod = "qr_code" | "pairing_code";

export interface Invitation {
  object: "invitation";
  id: string;
  projectId: string | null;
  status: InvitationStatus;
  /** The page to send. Only on create and resend. */
  url: string | null;
  inviteeName: string | null;
  inviteeEmail: string | null;
  inviteePhone: string | null;
  suggestedCountry: string | null;
  methods: InvitationMethod[];
  /** The `historySync` of the account the invitee links. */
  historySync: HistorySyncSetting;
  accountName: string | null;
  /** Set once `status` is `completed`. */
  accountId: string | null;
  /** The preset location, or what the invitee picked on the page. `null` until chosen. */
  proxyLocation: ProxyLocation | null;
  failureReason: string | null;
  returnUrl: string | null;
  metadata: Record<string, string>;
  /** When the invitation email was queued, if any. */
  emailSentAt: string | null;
  expiresAt: string;
  viewedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvitationCreateParams {
  projectId?: string;
  /** Preset the proxy location. Without it, the invitee picks the country and city on the page. */
  proxyLocation?: ProxyLocation;
  accountName?: string;
  inviteeName?: string;
  inviteeEmail?: string;
  inviteePhone?: string;
  suggestedCountry?: string;
  methods?: InvitationMethod[];
  /** `recent` makes the linked account import the phone's recent chats. Default `none`. */
  historySync?: HistorySyncSetting;
  returnUrl?: string;
  expiresInDays?: number;
  metadata?: Record<string, string>;
}

export interface InvitationListParams extends ProjectListParams {
  status?: InvitationStatus;
}

// ---------- webhook endpoints ----------

export const WEBHOOK_EVENT_TYPES = [
  "account.qr_code_issued",
  "account.pairing_code_issued",
  "account.connected",
  "account.disconnected",
  "account.failed",
  "message.received",
  "message.sent",
  "message.delivered",
  "message.read",
  "message.failed",
  "message.edited",
  "message.deleted",
  "poll.voted",
  "group.joined",
  "group.updated",
  "group.join_requested",
  "group.join_request_revoked",
  "chat.updated",
  "chat.presence_updated",
  "contact.presence_updated",
  "contact.picture_updated",
  "contact.updated",
  "blocklist.updated",
  "label.updated",
  "call.received",
  "call.ended",
  "channel.message_received",
  "channel.message_updated",
  "channel.updated",
  "history.synced",
  "project.created",
  "project.updated",
  "project.deleted",
  "invitation.status_changed",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface WebhookEndpoint {
  object: "webhook_endpoint";
  id: string;
  /** `null`: an organization endpoint, which receives every project's events. */
  projectId: string | null;
  url: string;
  events: WebhookEventType[];
  active: boolean;
  /** Signing secret (`whsec_…`). Only on create and rotate. */
  secret?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEndpointCreateParams {
  url: string;
  events: WebhookEventType[];
  projectId?: string;
}

export interface WebhookEndpointUpdateParams {
  url?: string;
  events?: WebhookEventType[];
  active?: boolean;
}

// ---------- event-only objects ----------

export interface PollVote {
  object: "poll_vote";
  accountId: string;
  chatId: ChatId | null;
  messageId: string | null;
  voterId: ContactId;
  options: string[];
  votedAt: string;
  poll: Message | null;
}

export interface GroupChange {
  object: "group_change";
  accountId: string;
  groupId: string;
  actorId: ContactId | null;
  added: ContactId[];
  removed: ContactId[];
  promoted: ContactId[];
  demoted: ContactId[];
  name: string | null;
  description: string | null;
  locked: boolean | null;
  announce: boolean | null;
  changes: string[];
  changedAt: string | null;
}

export interface ChatChange {
  object: "chat_change";
  accountId: string;
  chatId: ChatId;
  change: "archive" | "pin" | "mute" | "read" | "delete" | "clear" | "star";
  value: unknown;
  messageId: string | null;
  mutedUntil: string | null;
}

export interface ChatPresence {
  object: "chat_presence";
  accountId: string;
  chatId: ChatId;
  contactId: ContactId;
  state: ChatPresenceState;
}

export interface ContactPresence {
  object: "contact_presence";
  accountId: string;
  contactId: ContactId;
  online: boolean;
  lastSeenAt: string | null;
}

export interface PictureChange {
  object: "picture_change";
  accountId: string;
  chatId: ChatId;
  pictureId: string | null;
  removed: boolean;
  changedBy: ContactId | null;
  changedAt: string | null;
}

export interface BlocklistChange {
  object: "blocklist_change";
  accountId: string;
  changes: Array<{ contactId: ContactId; action: "block" | "unblock" }>;
  /** WhatsApp only said the list changed: call `contacts.listBlocked()`. */
  refetch: boolean;
}

export interface LabelChange {
  object: "label_change";
  accountId: string;
  kind: "label" | "chat" | "message";
  labelId: string;
  name: string | null;
  color: number | null;
  deleted: boolean | null;
  chatId: ChatId | null;
  messageId: string | null;
  labeled: boolean | null;
}

export interface Call {
  object: "call";
  id: string | null;
  accountId: string;
  from: ContactId | null;
  video: boolean;
  groupId: string | null;
  endReason: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

export interface ChannelChange {
  object: "channel_change";
  accountId: string;
  channelId: string;
  change: "followed" | "unfollowed" | "muted" | "unmuted";
  name: string | null;
  role: string | null;
}

export interface HistorySync {
  object: "history_sync";
  accountId: string;
  chunk: number | null;
  syncType: string | null;
  progress: number | null;
  part: number | null;
  conversationCount: number;
  messageCount: number;
  duplicateCount: number;
}

// ---------- events ----------

export interface EventObjectMap {
  "account.qr_code_issued": Account;
  "account.pairing_code_issued": Account;
  "account.connected": Account;
  "account.disconnected": Account;
  "account.failed": Account;
  "message.received": Message;
  "message.sent": Message;
  "message.delivered": Message;
  "message.read": Message;
  "message.failed": Message;
  "message.edited": Message;
  "message.deleted": Message;
  "poll.voted": PollVote;
  "group.joined": Group;
  "group.updated": GroupChange;
  "group.join_requested": GroupJoinRequest;
  "group.join_request_revoked": GroupJoinRequest;
  "chat.updated": ChatChange;
  "chat.presence_updated": ChatPresence;
  "contact.presence_updated": ContactPresence;
  "contact.picture_updated": PictureChange;
  "contact.updated": Contact;
  "blocklist.updated": BlocklistChange;
  "label.updated": LabelChange;
  "call.received": Call;
  "call.ended": Call;
  "channel.message_received": ChannelMessage;
  "channel.message_updated": ChannelMessage;
  "channel.updated": ChannelChange;
  "history.synced": HistorySync;
  "project.created": Project;
  "project.updated": Project;
  "project.deleted": Project;
  "invitation.status_changed": Invitation;
}

interface PreviousAttributesMap {
  "message.edited": { text: string | null };
  "invitation.status_changed": { status: InvitationStatus };
}

/** One webhook delivery body. Deduplicate on `id`. */
export type WebhookEventOf<T extends WebhookEventType> = {
  id: string;
  object: "event";
  type: T;
  createdAt: string;
  organizationId: string;
  /** The project the event belongs to. `null` when unassigned. */
  projectId: string | null;
  data: T extends keyof PreviousAttributesMap
    ? { object: EventObjectMap[T]; previousAttributes: PreviousAttributesMap[T] }
    : { object: EventObjectMap[T] };
};

/** Every webhook event, discriminated on `type`. */
export type WebhookEvent = { [T in WebhookEventType]: WebhookEventOf<T> }[WebhookEventType];
