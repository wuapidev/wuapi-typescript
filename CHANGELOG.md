# Changelog

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
