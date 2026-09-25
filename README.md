# wuapi TypeScript SDK

[![npm version](https://img.shields.io/npm/v/@wuapidev/sdk.svg)](https://www.npmjs.com/package/@wuapidev/sdk)
[![CI](https://github.com/wuapidev/wuapi-typescript/actions/workflows/ci.yml/badge.svg)](https://github.com/wuapidev/wuapi-typescript/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@wuapidev/sdk.svg)](LICENSE)

TypeScript SDK for [wuapi](https://wuapi.dev), an unofficial WhatsApp API. Link your own WhatsApp numbers by QR code or pairing code, send and receive messages, manage chats, contacts, groups, communities and channels, split them into projects, and verify webhooks.

- Zero runtime dependencies. Uses the global `fetch` and WebCrypto.
- ESM with TypeScript types that match the [OpenAPI spec](https://wuapi.dev/openapi.json).
- Retries, timeouts and idempotency keys built in.

Docs: [wuapi.dev/docs](https://wuapi.dev/docs). OpenAPI: [wuapi.dev/openapi.json](https://wuapi.dev/openapi.json).

> **Unofficial.** wuapi is not affiliated with, endorsed by or sponsored by WhatsApp or Meta, and it does not use the WhatsApp Business Platform (Cloud API). Numbers are linked as devices, the same way WhatsApp Web works. WhatsApp can restrict or ban numbers that behave like spam. You are responsible for your recipients' consent and for following WhatsApp's terms.

## Install

```sh
npm install @wuapidev/sdk
# or: pnpm add @wuapidev/sdk / yarn add @wuapidev/sdk / bun add @wuapidev/sdk
```

Using a coding agent? Paste [wuapi.dev/llms-full.txt](https://wuapi.dev/llms-full.txt), the whole documentation as one Markdown file.

## Requirements

The SDK needs a global `fetch` and WebCrypto (`crypto.subtle`, for webhook signatures). It runs on:

- Node 18 or later
- Bun
- Deno: `import { Wuapi } from "npm:@wuapidev/sdk";`
- Edge runtimes with `fetch` and WebCrypto, such as Cloudflare Workers and Vercel Edge Functions

Elsewhere, pass your own implementation as `new Wuapi({ fetch })`. The package is ESM only.

## Authentication

Create an API key in the dashboard at [wuapi.dev/app/api-keys](https://wuapi.dev/app/api-keys). Keys look like `wu_live_...` and are sent as `Authorization: Bearer <key>`. Keep them on your server.

```ts
import { Wuapi } from "@wuapidev/sdk";

const wuapi = new Wuapi({ apiKey: process.env.WUAPI_API_KEY });
```

`apiKey` falls back to the `WUAPI_API_KEY` environment variable, so `new Wuapi()` works when it is set. On runtimes without `process.env`, such as most edge runtimes, pass `apiKey` yourself. A missing key throws when the client is created.

An organization key reaches every project. A project key, created with `projects.apiKeys.create`, reaches only its project: see [Projects](#projects).

## Quickstart: link a number and send a message

```ts
import { Wuapi } from "@wuapidev/sdk";

const wuapi = new Wuapi({ apiKey: process.env.WUAPI_API_KEY });

// 1. Pick where the number's traffic exits: use the phone number's country.
const [location] = await wuapi.proxyLocations.list({ country: "VE" }).toArray(1);

// 2. Create an account. Your first one links with no card; sending starts with the free trial (402 before it).
const account = await wuapi.accounts.create({
  name: "Support line",
  proxyLocation: { country: location!.country, city: location!.city },
});

// 3. Wait for the QR code and show it to the phone owner.
//    On the phone: WhatsApp > Linked devices > Link a device.
const withQr = await wuapi.accounts.waitForQrCode(account.id);
console.log("Scan this QR code:", withQr.qrCodeUrl); // PNG data URL, e.g. <img src={qrCodeUrl} />

// 4. Wait until the phone finishes linking. The QR code rotates while it
//    waits; onQrCode is called with each new one.
const ready = await wuapi.accounts.waitUntilReady(account.id, {
  onQrCode: (qrCodeUrl) => console.log("New QR code:", qrCodeUrl),
});
console.log("Linked", ready.phone);

// 5. Send a message.
const message = await wuapi.messages.send({
  accountId: ready.id,
  to: "+584241112233",
  text: "Your order has shipped.",
});
console.log(message.id, message.status); // "queued"
```

`proxyLocation` is required: every account connects through its own residential proxy, and `{ country, city }` says where it exits. `proxyLocations.list()` returns every supported pair (`country` is ISO 3166-1 alpha-2, `city` a lowercase slug); anything else answers `400 unsupported_proxy_location`. Search it with `q`, which ignores case and accents and returns the best match first: `proxyLocations.list({ q: "sao" })` starts with São Paulo.

A send returns the message with `status: "queued"`. The outcome arrives as the `message.sent` or `message.failed` webhook, or by calling `wuapi.messages.get(id)`. A recipient without WhatsApp fails with `error.code: "not_on_whatsapp"`.

Every resource carries `object` (`"account"`, `"message"`, ...). Contacts are E.164 (`+584241112233`), or `lid:<digits>` when WhatsApp hides the number; groups are `…@g.us`, channels `…@newsletter`.

## Link by pairing code instead of QR

When the phone owner cannot scan a screen, link by phone number. They type an 8-character code in WhatsApp > Linked devices > Link a device > Link with phone number instead.

```ts
// Either create the account with pairingPhone...
const account = await wuapi.accounts.create({
  name: "Field phone",
  proxyLocation: { country: "VE", city: "caracas" },
  pairingPhone: "+584121234567",
});
const { pairingCode } = await wuapi.accounts.waitForPairingCode(account.id);
console.log("Type this on the phone:", pairingCode); // "ABCD-1234"

// ...or ask for a code for an account that is not linked yet.
const { code, expiresAt } = await wuapi.accounts.createPairingCode(account.id, { phone: "+584121234567" });

// Codes expire after about 160 seconds; waitUntilReady reports each new one.
await wuapi.accounts.waitUntilReady(account.id, { onPairingCode: (c) => console.log("New code:", c) });
```

`createPairingCode` answers `409 already_linked` for an account that is already `ready`.

## Sending other types

```ts
await wuapi.messages.send({
  accountId,
  to: "+584241112233",
  type: "document",
  media: { url: "https://example.com/invoice.pdf", filename: "invoice.pdf" },
  text: "Your invoice",
});

await wuapi.messages.send({
  accountId,
  to: "+584241112233",
  type: "location",
  location: { latitude: 10.4806, longitude: -66.9036, name: "Store" },
});

// Reply to (quote) a message in the same chat.
await wuapi.messages.send({ accountId, to: "+584241112233", text: "Tomorrow.", replyToMessageId: "msg_..." });

// Voice note (send ogg/opus; nothing is transcoded).
await wuapi.messages.send({
  accountId,
  to: "+584241112233",
  type: "voice",
  media: { url: "https://example.com/note.ogg", mimeType: "audio/ogg; codecs=opus" },
});

// Poll, then vote in it and read the tally from the returned message.
const poll = await wuapi.messages.send({
  accountId,
  to: "120363041234567890@g.us",
  type: "poll",
  poll: { name: "Lunch?", options: ["Pizza", "Sushi"], selectableCount: 1 },
});
await wuapi.messages.vote(poll.id, ["Sushi"]);

// Edit, star, react to and delete what you sent.
await wuapi.messages.edit(message.id, "Your order has shipped. Tracking: 1Z999.");
await wuapi.messages.star(message.id);
await wuapi.messages.react(message.id, "\u{1F44D}");
await wuapi.messages.delete(message.id);

// Send to a group, or post to a channel you administer, by its id.
await wuapi.messages.send({ accountId, to: "120363041234567890@g.us", text: "Hello group" });
await wuapi.messages.send({ accountId, to: "120363198765432101@newsletter", text: "Version 2.4 is out." });
```

Send types: `text`, `image`, `video`, `audio`, `voice` (an audio sent as a voice note), `document`, `sticker`, `location`, `contact`, `contacts`, `poll` and `calendar_event`. Any send also takes `mentions`, `mentionAll` (groups), `forwarded`, `viewOnce`, `disappearingSeconds`, `linkPreview` (text) and `media.gifPlayback`. A channel takes `text`, `image`, `video` and `document`.

Everything else works on the account: chats, contacts, the profile, privacy, stories, groups and communities, channels, labels and calls. Each method takes the `accountId` first, and the account must be `ready`. Opposites are two methods: `archive` / `unarchive`, `pin` / `unpin`, `mute` / `unmute`, `block` / `unblock`, `follow` / `unfollow`, `star` / `unstar`.

```ts
await wuapi.chats.sendReadReceipts(accountId, "+584241112233");      // blue ticks
await wuapi.chats.archive(accountId, "+584241112233");
const [check] = await wuapi.contacts.check(accountId, ["+584241112233"]);
await wuapi.stories.create(accountId, { text: "Open until 18:00", backgroundColor: "#0F766E" });
await wuapi.groups.create(accountId, { name: "Customers", community: true });
await wuapi.accounts.update(accountId, { rejectCalls: true, rejectCallsMessage: "Please write to us." });
```

## Pacing

Each number sends at most 12 messages a minute, 5 a minute to people who never wrote to it, and shows "typing..." for 800 to 6000 ms first. A paced message waits in the queue up to 60 minutes. Those are defaults, tunable per account:

```ts
const acc = await wuapi.accounts.update(accountId, {
  pacing: { messagesPerMinute: 20, typing: { maxMs: 4000 }, queueTimeoutMinutes: 120 },
});
acc.pacing; // effective values, with custom: true
await wuapi.accounts.update(accountId, { pacing: null }); // back to the defaults
```

Ranges: `messagesPerMinute` 1 to 30, `firstContactPerMinute` 1 to `messagesPerMinute`, `typing.minMs` 0 to 10000, `typing.maxMs` `minMs` to 20000, `typing.charsPerSecond` 5 to 100, `queueTimeoutMinutes` 1 to 1440. Faster pacing raises the chance WhatsApp restricts the number.

## Lists and pagination

List methods return a `Paginator`. Iterate it to walk every item across pages, or ask for one page:

```ts
for await (const message of wuapi.messages.list({ accountId, direction: "inbound" })) {
  console.log(message.from, message.text);
}

const { items, nextCursor } = await wuapi.messages.list({ limit: 20 }).page();
const next = await wuapi.messages.list({ limit: 20 }).page(nextCursor ?? undefined);
```

Every list has the same shape, `{ object: "list", items, nextCursor }`, including lists read live from WhatsApp (`groups.list`, `channels.list`, `contacts.listBlocked`, `channels.listMessages`, ...). Batch actions (`contacts.check`, `groups.addParticipants`, ...) return arrays.

## Webhooks

Create an endpoint once and store the secret; it is returned only on creation.

```ts
const endpoint = await wuapi.webhookEndpoints.create({
  url: "https://example.com/webhooks/wuapi",
  events: ["message.received", "message.failed", "account.disconnected"],
});
console.log(endpoint.secret); // whsec_...
```

Verify each request with the raw body, before parsing it as JSON:

```ts
import { verifyWebhook, WebhookVerificationError } from "@wuapidev/sdk";

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    const event = await verifyWebhook(
      rawBody,
      request.headers.get("wuapi-signature"),
      process.env.WUAPI_WEBHOOK_SECRET!,
    );
    switch (event.type) {
      case "message.received":
        console.log(event.data.object.from, event.data.object.text);
        break;
      case "account.disconnected":
        console.log(event.data.object.id, event.data.object.disconnectReason);
        break;
    }
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof WebhookVerificationError) return new Response("invalid signature", { status: 400 });
    throw err;
  }
}
```

`verifyWebhook` checks the `Wuapi-Signature` header (`t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<rawBody>">`) in constant time and rejects timestamps more than 300 seconds away (pass a fourth argument to change it). Deliveries can repeat: deduplicate on `event.id`.

Every event has the same envelope: `{ id, object: "event", type, createdAt, organizationId, projectId, data: { object } }`. `data.object` is the resource in its REST shape (an `account`, a `message`, a `group`, ...) or the event's own object (`poll_vote`, `call`, `chat_change`, ...). `message.edited` and `invitation.status_changed` add `data.previousAttributes`. `WEBHOOK_EVENT_TYPES` lists every type.

## Projects

Three levels: your **organization** pays; a **project** is one of your customers, or an environment, with its own accounts, API keys, webhooks, limits and usage, isolated from every other project; an **account** is a linked WhatsApp number with a name, like "Sales" or "Support".

```ts
// Organization key: create the project with your own id for the customer.
const project = await wuapi.projects.create({ name: "Northwind Dental", externalId: "customer_8812", maxAccounts: 3 });

// Act inside it: every request carries the Wuapi-Project header.
const northwind = wuapi.withProject("ext:customer_8812"); // or project.id
await northwind.accounts.list().page();                    // only Northwind's accounts
await northwind.webhookEndpoints.create({ url: "https://example.com/hooks/northwind", events: ["message.received"] });

// Or hand the customer a key that can only reach their project.
const { key } = await wuapi.projects.apiKeys.create(project.id, { name: "Northwind production" });
const theirs = new Wuapi({ apiKey: key! });
```

`new Wuapi({ project })` does the same as `withProject` from the start. A resource outside the scope answers `404 not_found`; a project key naming another project answers `403 forbidden`. Every webhook payload carries `organizationId` and `projectId`. An organization endpoint receives every project's events; a project endpoint receives only its own.

### Invitations

Instead of building a QR screen, send someone else, your customer, a store manager or a sales rep, an invitation: a page on wuapi with your name, logo and color where they link their own number. They need no account or key.

```ts
await wuapi.branding.update({ displayName: "Northwind Cloud", accentColor: "#0F766E" });
// hideWuapiBranding: true also needs the White label add-on; without it: 402 addon_required.

const invitation = await wuapi.invitations.create({
  projectId: "ext:customer_8812",
  inviteeName: "Maria Perez",
  inviteeEmail: "maria@example.com",
  accountName: "Front desk",
  suggestedCountry: "MX",
  returnUrl: "https://app.example.com/settings/whatsapp",
  metadata: { store: "cdmx-2" },
});
if (!invitation.emailSentAt) console.log(invitation.url); // send it yourself; it is returned only by create and resend
```

Pass `proxyLocation` to preset where the account's proxy exits; without it the invitee picks the country and city on the page (`invitation.proxyLocation` is `null` until then). They then scans a live QR or types a pairing code. The account is created in the project when they start and named `accountName`; `metadata` is copied onto it when the number is linked. Each step fires `invitation.status_changed`, with the invitation as `data.object` and `data.previousAttributes.status`: `pending` → `in_progress` → `completed`, or `failed` (the link keeps working and a retry reuses the account). `expired` is computed on read, from `expiresInDays` (1 to 30, default 7).

```ts
for await (const inv of wuapi.invitations.list({ status: "failed" })) console.log(inv.id, inv.failureReason);
await wuapi.invitations.resend(invitation.id); // new url, the old one stops working, emailed again
await wuapi.invitations.cancel(invitation.id); // 409 already_completed once completed
```

### Suspension, limits and usage

```ts
await wuapi.projects.update("ext:customer_8812", { status: "suspended" }); // sends and writes answer 403 project_suspended; inbound keeps arriving
await wuapi.projects.update("ext:customer_8812", { status: "active" });

const report = await wuapi.usage.byProject({ month: "2026-09" }); // one line per project, for rebilling
for (const line of report.projects) console.log(line.externalId, line.billableAccountCount, line.sentMessageCount);
```

wuapi bills the organization across all its projects; `usage.byProject` is what you rebill from. `usage.get()` is the organization's own bill this month: every billable account includes 0.5 GB of proxy, pooled, so `proxyBytes` is everything used, `includedProxyBytes` the pool, and `proxyFeeCents` bills only `billableProxyBytes`, the traffic past it, at $3 per GB.

## Errors

Every non-2xx response throws a `WuapiError` with `status`, `code`, `message`, `details` and `requestId` (when the server sends `x-request-id`).

```ts
import { WuapiError } from "@wuapidev/sdk";

try {
  await wuapi.messages.send({ accountId, to: "+584241112233", text: "hi" });
} catch (err) {
  if (err instanceof WuapiError && err.code === "account_not_ready") {
    await wuapi.accounts.reconnect(accountId);
  }
}
```

A request that never got a response throws a `WuapiError` with `status: 0` and `code` set to `timeout`, `network_error` or `aborted` (your `signal` fired). The docs list every API error code.

## Retries and timeouts

The client retries a failed request up to `maxRetries` times (default 2):

- `429 rate_limited`, waiting for `Retry-After` (at most 60 seconds).
- 5xx responses, network errors and timeouts, with exponential backoff and jitter, starting under 0.5 s and capped at 8 s.

Other 4xx responses throw right away. `timeoutMs` (default `30_000`) applies to each attempt. Cancel a call with an `AbortSignal`:

```ts
const wuapi = new Wuapi({ timeoutMs: 10_000, maxRetries: 4 });

const controller = new AbortController();
setTimeout(() => controller.abort(), 5_000);
await wuapi.messages.get("msg_...", { signal: controller.signal });
```

## Idempotency

Every `POST` carries an `Idempotency-Key` header, generated per call when you do not pass one, so a retried send or create is answered with the first response (`Idempotent-Replayed: true`) instead of running twice. Pass your own key to make retries across processes safe too:

```ts
await wuapi.messages.send({ accountId, to: "+584241112233", text: "Shipped." }, { idempotencyKey: "order-A-1042-shipped" });
```

Every method takes this options object last: `{ idempotencyKey?, signal? }`.

## Options

```ts
new Wuapi({
  apiKey: "wu_live_...",           // or WUAPI_API_KEY
  baseUrl: "https://api.wuapi.dev", // default
  timeoutMs: 30_000,               // per attempt
  maxRetries: 2,
  fetch: customFetch,              // optional
  project: "ext:customer_8812",     // optional: sends Wuapi-Project on every request
});
```

## Reference

| Resource | Methods |
|---|---|
| `proxyLocations` | `list` |
| `accounts` | `list`, `create`, `get`, `update`, `delete`, `reconnect`, `logout`, `createPairingCode`, `setPresence`, `setDefaultDisappearingTimer`, `waitForQrCode`, `waitForPairingCode`, `waitUntilReady` |
| `messages` | `send`, `list`, `get`, `edit`, `delete`, `react`, `vote`, `star`, `unstar`, `addLabel`, `removeLabel` |
| `chats` | `sendPresence`, `sendReadReceipts`, `markRead`, `markUnread`, `archive`, `unarchive`, `pin`, `unpin`, `mute`, `unmute`, `delete`, `setDisappearingTimer`, `addLabel`, `removeLabel` |
| `stories` | `create` |
| `contacts` | `check`, `lookup`, `getPicture`, `getBusinessProfile`, `subscribePresence`, `block`, `unblock`, `listBlocked`, `getLink`, `resetLink`, `resolveLink` |
| `bots` | `list` |
| `profile` | `update`, `setPicture`, `deletePicture` |
| `privacy` | `get`, `update`, `getStoryPrivacy` |
| `labels` | `upsert`, `delete` |
| `calls` | `reject` |
| `stickerPacks`, `orders` | `get` |
| `groups` | `list`, `create`, `get`, `update`, `leave`, `addParticipants`, `removeParticipants`, `promoteParticipants`, `demoteParticipants`, `getInviteLink`, `resetInviteLink`, `join`, `getInvite`, `setPicture`, `deletePicture`, `listJoinRequests`, `approveJoinRequests`, `rejectJoinRequests`, `listSubgroups`, `linkSubgroup`, `unlinkSubgroup`, `listCommunityParticipants` |
| `channels` | `list`, `create`, `get`, `getInvite`, `follow`, `unfollow`, `mute`, `unmute`, `listMessages`, `react`, `markViewed` |
| `webhookEndpoints` | `list`, `create`, `get`, `update`, `delete`, `rotateSecret` |
| `projects` | `list`, `create`, `get`, `update`, `delete`, `getUsage`, `apiKeys.list`, `apiKeys.create`, `apiKeys.revoke` |
| `invitations` | `create`, `list`, `get`, `cancel`, `resend` |
| `branding` | `get`, `update` |
| `usage` | `get`, `byProject` |
| client | `me()`, `withProject(project)`, `project` |

Account-level resources take the `accountId` first.

## Links

- Documentation: [wuapi.dev/docs](https://wuapi.dev/docs)
- OpenAPI spec: [wuapi.dev/openapi.json](https://wuapi.dev/openapi.json)
- The docs as one Markdown file, for coding agents: [wuapi.dev/llms-full.txt](https://wuapi.dev/llms-full.txt)
- Releases and changelog: [GitHub Releases](https://github.com/wuapidev/wuapi-typescript/releases)

## Contributing

This repository mirrors the SDK from the wuapi monorepo, where it is developed. Issues are welcome here, and a maintainer ports pull requests: see [CONTRIBUTING.md](CONTRIBUTING.md). To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

MIT
