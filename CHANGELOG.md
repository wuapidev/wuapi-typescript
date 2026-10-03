# Changelog

## 0.13.0

### Added

- **Streams.** `client.events.stream(params?, options?)` opens Streams
  (`GET https://stream.wuapi.dev/v1/events/stream`): your events over one connection your code
  opens, the same envelope a webhook carries, with no public endpoint and no signature to verify.
  It returns an `EventStream`: iterate it with `for await` for the events.
  - `types` and `accounts` filter it (up to 50 values each). The loop's event is typed by `types`:
    `stream({ types: ["message.received"] })` yields `message.received` events. Presence events and
    `webhook.test` are not on Streams, so `types` does not take them (`StreamEventType`).
  - It reconnects and resumes by itself with `Last-Event-ID`, waits what the stream asks (`retry`,
    `Retry-After`) with jitter, starts at most 6 connects a minute per client, and delivers an
    event once when a replay repeats it. `lastEventId` starts after a cursor, and
    `stream.lastEventId` is the cursor to save.
  - `options.onStatus` is told what is not an event: `open`, `reconnecting` (with `reason`,
    `delayMs` and `failures`), `reset` (the cursor was too old: resync over REST, the stream goes
    on live) and `skipped`. `stream.items()` yields those in order with the events, each event
    with its `cursor`, `id` and raw `data`.
  - `options.signal`, `stream.close()` or `break` end it without an error. What waiting cannot
    fix ends it with a `StreamError` (a `WuapiError` with `kind`): `unauthorized`, `forbidden`,
    `invalid_request`, `not_found`, `refused`, `unexpected_response`, and `gave_up` when
    `giveUpAfterMs` is set. A `429`, a `5xx` and a network error are never errors: they are
    retried.
  - It uses `fetch` and streams, not `EventSource` (which cannot send the `Authorization`
    header), so it runs on Node 18+, Bun, Deno and edge runtimes. The key is sent in the header
    only, and only to `https` (or to `http` on localhost).
- `ClientOptions.streamBaseUrl`: another stream host. Without it, a client pointed at another
  `baseUrl` streams from that origin, so its key never reaches the production stream.
- Exports `EventStream`, `StreamError`, `SseParser`, `STREAM_SPEC` and the types `EventsResource`,
  `EventsStreamParams`, `StreamEventType`, `StreamResetReason`, `StreamItem`, `StreamStatus`,
  `StreamState`, `StreamOptions`, `StreamErrorKind`, `StreamSpec`, `StreamTiming`, `StreamLimits`,
  `StreamRefusal`, `StreamInit`, `StreamRuntime` and `SseItem`.
- `HttpClient.openStream(url, headers, signal)`: one `GET` with the client's key and project, read
  as it arrives, with no timeout, no retries and no redirect followed.

The stream client is generated like the rest of the SDK, from one description of Streams, and is
held to the same behaviour as every other wuapi SDK by a shared conformance suite
(`test/stream-conformance/`).

## 0.12.0

### Added

- `messages.forward(messageId, { to })`: forward a message wuapi stores (received, sent through
  the API or sent from the phone) to up to 5 chats of the same account, the way WhatsApp
  forwards. No content and no file to move: the forwarded message names the file WhatsApp
  already holds. Returns a `MessageList` with one `queued` message per chat, in the order of
  `to`; each is a message like any other (`forwarded: true`, its own events). Polls, calendar
  events, reactions, view-once and deleted messages answer `400 not_forwardable`
  (`details.reason`), and so does a contact's story (`reason: story`): a story the account
  posted is a message and forwards like one. A file neither WhatsApp nor wuapi has answers
  `410 media_expired`.
- `Message.forwardedManyTimes`: WhatsApp's "Forwarded many times" (five or more forwards), on
  received and sent messages. Such a message is forwarded to one chat per request.
- Types `ForwardMessageRequest` and `MessagesForwardParams`; `media_expired` in
  `MessageError.code` (a forward whose file was gone by the time it was sent).
- `favoriteStickers`: the account's favorite stickers, the star tab of WhatsApp's sticker
  picker. `favoriteStickers.list(accountId)` reads them, newest first;
  `favoriteStickers.getMedia(accountId, stickerId)` returns a direct URL to one's file,
  fetching it from WhatsApp the first time; `favoriteStickers.add(accountId, { messageId })`
  or `{ uploadId }` favorites a sticker from a message or an uploaded WebP file; and
  `favoriteStickers.remove(accountId, stickerId)` removes one. Adding and removing change
  the list on the phone too.
- Webhook event `sticker.favorites_updated` (`StickerFavoritesUpdatedEvent`), with
  `data.object` a `StickerFavoritesChange`: `reason` is `added`, `removed` or `synced`.
- Types `FavoriteSticker`, `FavoriteStickerMedia`, `FavoriteStickerMediaFile`,
  `FavoriteStickerAddRequest` (`FavoriteStickerFromMessage` or `FavoriteStickerFromUpload`),
  `StickerFavoritesChange` and the `FavoriteStickers*Params`.
- `MessageMedia.gifPlayback`: `true` for a video that WhatsApp plays as a GIF, received
  or sent. A received GIF is `type: "video"` with `media.gifPlayback: true` (it was
  `type: "unknown"` on some accounts before).
- Contacts' stories. `stories.list(accountId, { contactId?, unviewed? })` pages through the
  stories the account's contacts posted in the last 24 hours, one `StoryGroup` per contact
  (newest activity first), each with its `stories` oldest first. `stories.get` reads one,
  `stories.getMedia` returns its file's URL (downloaded from WhatsApp on first use).
  Contacts' stories arrive only for accounts with stories turned on.
- `stories.view(accountId, storyId)`: tell the author the account saw their story. It is
  the only call that does: listing, reading and downloading never mark a story as viewed.
  The answer's `authorNotified` is `false` when WhatsApp kept the view from the author
  (the account's read receipts are off).
- `stories.react(accountId, storyId, { emoji })`, and replies to a story:
  `messages.send({ accountId, to: story.contactId, text, replyToStoryId: story.id })`.
- The account's own stories: `stories.listOwn(accountId)` (the last 24 hours, with
  `viewCount`), `stories.listViewers(accountId, storyId)` (who saw one, with their
  reaction) and `stories.delete(accountId, storyId)`. A posted story's id is its message id.
- Webhook events `story.received`, `story.deleted` (`data.object` is a `Story`) and
  `story.viewed`, `story.reacted` (a `StoryViewer`), in `WEBHOOK_EVENT_TYPES` and the
  `WebhookEvent` union.
- Types `Story`, `StoryFile`, `StoryGroup`, `StoryViewer`, `StoryMediaFile`, `StoryEvent`
  and `StoryViewerEvent`. `StoryFile.gifPlayback` says when a video story plays as a GIF,
  like `MessageMedia.gifPlayback`.
- `Message.replyToStoryId`: the story a message replies to, `null` otherwise. Always
  present, so a hand-built `Message` (a test fixture) needs the field.

### Changed

- `forwarded` on a send is documented as what it is: it labels a new message as forwarded.
  Nothing changed in its behavior.
- `MessageMedia.width` and `MessageMedia.height` are also set for a WebP sticker sent
  through the API, once it is `sent`, and for a received sticker. A forwarded message keeps
  its source's.

## 0.11.0

### Added

- `Chat.pinnedAt`: when the chat was pinned, `null` when it is not pinned or the time is
  unknown.

### Changed

- `Chat.pinned`, `Chat.archived`, `Chat.muted`, `Chat.unread` and `Chat.unreadCount` are
  now known for chats that had no change since the number was linked: wuapi takes them
  from what WhatsApp syncs to the linked number. `null` still means "not known yet".
  Documentation only; no type changed.

## 0.10.0

### Added

- `uploads.upload(file, { mimeType?, filename? })`: upload a file you have (a `Blob`, `File`,
  `Buffer`, `Uint8Array`, `ArrayBuffer` or stream) and get back a `ready` `Upload`. Send it
  with `messages.send({ ..., media: { uploadId: upload.id } })` or `stories.create`. Small
  files go in one request; larger ones, up to 100 MB, are posted straight to storage and a
  dropped connection is retried.
- `uploads.create`, `uploads.get` and `uploads.complete`: the same steps one by one.
- `media: { uploadId }` on every media send and on image and video stories, next to
  `media: { url }`. A `ready` upload can be sent any number of times for 24 hours.
- Types `Upload`, `UploadStatus`, `UploadCreateRequest` (`FileUploadCreateRequest` or
  `InlineUploadCreateRequest`), `UploadCompleteRequest`, `UploadFile`, `UploadFileParams`,
  `SendMediaUrl`, `SendMediaUpload`, `SendImageMediaUrl`, `SendImageMediaUpload`,
  `SendVideoMediaUrl`, `SendVideoMediaUpload`, `StoryMediaUrl` and `StoryMediaUpload`.

### Changed

- `SendMedia`, `SendImageMedia`, `SendVideoMedia` and `StoryMedia` are now unions of their
  `...Url` and `...Upload` shapes. `media: { url }` keeps working as before; code that named
  the type and read `.url` from it needs to narrow first (`"url" in media`).

## 0.9.0

### Added

- `media.quality` on an image send (`messages.send`) and on an image story
  (`stories.create`): `"standard"`, `"hd"` or `"original"`. It overrides the account's
  setting for that image.
- `Account.imageQuality` and `accounts.update(id, { imageQuality })`: what the account's
  images are re-encoded to before their upload. `"standard"` by default (longest side
  1600 px, JPEG quality 80, as the WhatsApp apps send a photo), `"hd"` (4096 px, quality
  90) or `"original"` (the file as it is, metadata removed).
- Types `ImageQualitySetting` and `SendImageMedia`.

## 0.8.0

### Added

- `contacts.list(accountId, { q?, limit?, cursor? })`: the account's address book as its
  phone synced it to wuapi, ordered by saved name, as a paginator of `Contact`.
  `contacts.get(accountId, contactId)` returns one. Neither asks WhatsApp.
- `Contact.phone`, `Contact.savedName` and `Contact.profileName`. The contact list fills
  them; `contacts.lookup` and `contact.updated` answer `savedName` and `profileName` as
  `null`.
- `Chat.pictureId`: the id of the chat's picture (a contact's or a group's), `null` when
  unknown. Compare it with the picture you cached before calling `contacts.getPicture`,
  which also takes a group id.
- `MessageMedia.width`, `MessageMedia.height` and `MessageMedia.durationSeconds`. Set for
  an image sent through the API; `null` for received files for now.
- Types `ContactsListParams`.

## 0.7.0

### Added

- `messages.getMedia(messageId)`: a message's file as `{ object: "media", url, ... }`,
  downloading it first when it is still on WhatsApp (on-demand media).
- `MessageMedia.downloaded` and `MessageMedia.size`. Received media is on demand by
  default for new accounts: `downloaded: false` means `url` is the API endpoint that
  fetches it (API key required), not the file.
- `Account.mediaAutoDownload` and `accounts.update(id, { mediaAutoDownload })`:
  `"none"`, `"all"` or `{ maxBytes, types }`.
- The `message.media_downloaded` webhook event: a received file stored by a
  background retry is ready (`media.downloaded: true`).

## 0.6.0

### Added

- `chats.list(accountId, { archived?, unread?, type?, q?, limit?, cursor? })`: an account's
  chats, newest message first, as a paginator of `Chat`. `chats.get(accountId, chatId)`
  returns one.
- Types `Chat`, `ChatList`, `ChatsListParams` and `ListChatsType`. A `Chat` carries its name
  (`name`, `savedName`, `profileName`, `username`), its `lastMessage`, and WhatsApp's state
  of it: `unread`, `unreadCount`, `pinned`, `archived`, `muted`, `muteExpiresAt`. A state
  wuapi has not observed is `null`, not `false`.

## 0.5.0

The SDK is now generated from the OpenAPI spec (`https://wuapi.dev/openapi.json`)
instead of written by hand. Every 0.4.0 call, export and runtime behavior keeps
working: the 0.4.0 test suite runs unchanged against this version.

### Added

- Every body is also accepted as a params object, the same shape as the API:
  `messages.react(id, { emoji })`, `messages.edit(id, { text })`,
  `messages.vote(id, { options })`, `contacts.check(accountId, { phones })`, and so on.
- The batch methods called with a params object resolve to the API's list object
  (`{ object: "list", items }`): `contacts.check`, `contacts.lookup`,
  `groups.addParticipants`, `removeParticipants`, `promoteParticipants`,
  `demoteParticipants`, `approveJoinRequests`, `rejectJoinRequests`.
- A type for every params object and body (`MessagesReactParams`,
  `ContactsCheckParams`, ...), every list object (`ContactCheckList`, ...) and every
  webhook event (`MessageEvent`, `ChatUpdatedEvent`, ...).
- `ChatChange.muteExpiresAt`, the field the server sends: when a mute ends.
- Exports: `HttpClient`, `API_KEY_ENV`, `PACKAGE_NAME`, and the types `RequestOptions`,
  `Query`, `HttpMethod`, `PageFetcher`.

### Deprecated (removed in 1.0)

- Passing a single-field body on its own: `messages.react(id, "👍")`,
  `messages.edit(id, text)`, `messages.vote(id, options)`, `messages.addLabel(id, labelId)`,
  `accounts.setPresence(id, state)`, `accounts.setDefaultDisappearingTimer(id, seconds)`,
  `chats.sendPresence(...)`, `chats.setDisappearingTimer(...)`, `chats.addLabel(...)`,
  `groups.join(accountId, code)`, `groups.linkSubgroup(...)`, `channels.react(...)`,
  `channels.markViewed(...)`. Pass the params object instead.
- The bare arrays the batch methods return when called that way
  (`contacts.check(accountId, phones)` and the others above). Pass the params object and read `items`.
- `ChatChange.mutedUntil`. The server never set it; read `muteExpiresAt`.

### Type corrections

These change types only, to match what the API has always sent:

- `GroupJoin.groupId` is `string | null` (it is `null` when WhatsApp does not say which group was joined).
- `StickerPack.stickers[].mimeType` is `string | null`.
- `ChatChange.mutedUntil` is optional (it was never sent).
- Some response fields are narrower than 0.4.0 declared, which only matters if you
  build these objects yourself (for example in test fixtures):
  `Message.error.code` is the `MessageErrorCode` union, `GroupChange.changes` items and
  `ChatChange.value` are specific unions, and `Call.id` and `Call.from` are never `null`.
