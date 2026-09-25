import { describe, expect, it } from "vitest";
import { Wuapi } from "../src/index.js";
import { mockFetch } from "./helpers.js";

const KEY = "wu_live_" + "a".repeat(48);
const B = "https://api.wuapi.dev";
const A = `${B}/v1/accounts/acc_1`;
const G = `${A}/groups/123%40g.us`;
const CH = `${A}/channels/99%40newsletter`;

type Case = [label: string, run: (w: Wuapi) => Promise<unknown>, method: string, url: string, body?: unknown];

const list = { status: 200, body: { object: "list", items: [], nextCursor: null } };

// Every SDK method against the catalog in API_STYLE.md §14.
const CASES: Case[] = [
  ["me", (w) => w.me(), "GET", `${B}/v1/me`],
  ["usage.get", (w) => w.usage.get(), "GET", `${B}/v1/usage`],
  ["usage.byProject", (w) => w.usage.byProject({ month: "2026-09" }), "GET", `${B}/v1/usage/by-project?month=2026-09`],
  ["accounts.list", (w) => w.accounts.list({ projectId: "none" }).page(), "GET", `${B}/v1/accounts?projectId=none`],
  ["proxyLocations.list", (w) => w.proxyLocations.list({ country: "CL", limit: 5 }).page(), "GET", `${B}/v1/proxy-locations?country=CL&limit=5`],
  ["proxyLocations.list (search)", (w) => w.proxyLocations.list({ q: "são paulo", country: "BR" }).page(), "GET", `${B}/v1/proxy-locations?country=BR&q=s%C3%A3o+paulo`],
  ["accounts.create", (w) => w.accounts.create({ proxyLocation: { country: "VE", city: "caracas" }, name: "Sales", pairingPhone: "+584121234567" }), "POST", `${B}/v1/accounts`, { proxyLocation: { country: "VE", city: "caracas" }, name: "Sales", pairingPhone: "+584121234567" }],
  ["accounts.get", (w) => w.accounts.get("acc_1"), "GET", A],
  ["accounts.update", (w) => w.accounts.update("acc_1", { name: "S" }), "PATCH", A, { name: "S" }],
  ["accounts.delete", (w) => w.accounts.delete("acc_1"), "DELETE", A],
  ["accounts.reconnect", (w) => w.accounts.reconnect("acc_1"), "POST", `${A}/reconnect`],
  ["accounts.logout", (w) => w.accounts.logout("acc_1"), "POST", `${A}/logout`],
  ["accounts.createPairingCode", (w) => w.accounts.createPairingCode("acc_1", { phone: "+584121234567" }), "POST", `${A}/pairing-code`, { phone: "+584121234567" }],
  ["accounts.setPresence", (w) => w.accounts.setPresence("acc_1", "online"), "POST", `${A}/presence`, { state: "online" }],
  ["accounts.setDefaultDisappearingTimer", (w) => w.accounts.setDefaultDisappearingTimer("acc_1", 86400), "PUT", `${A}/disappearing-timer`, { durationSeconds: 86400 }],
  ["chats.sendPresence", (w) => w.chats.sendPresence("acc_1", "+584241112233", "typing"), "POST", `${A}/chats/%2B584241112233/presence`, { state: "typing" }],
  ["chats.sendReadReceipts", (w) => w.chats.sendReadReceipts("acc_1", "+584241112233"), "POST", `${A}/chats/%2B584241112233/read`, {}],
  ["chats.markRead", (w) => w.chats.markRead("acc_1", "+1"), "POST", `${A}/chats/%2B1/mark-read`],
  ["chats.markUnread", (w) => w.chats.markUnread("acc_1", "+1"), "POST", `${A}/chats/%2B1/mark-unread`],
  ["chats.archive", (w) => w.chats.archive("acc_1", "+1"), "POST", `${A}/chats/%2B1/archive`],
  ["chats.unarchive", (w) => w.chats.unarchive("acc_1", "+1"), "POST", `${A}/chats/%2B1/unarchive`],
  ["chats.pin", (w) => w.chats.pin("acc_1", "+1"), "POST", `${A}/chats/%2B1/pin`],
  ["chats.unpin", (w) => w.chats.unpin("acc_1", "+1"), "POST", `${A}/chats/%2B1/unpin`],
  ["chats.mute", (w) => w.chats.mute("acc_1", "+1", { durationSeconds: 3600 }), "POST", `${A}/chats/%2B1/mute`, { durationSeconds: 3600 }],
  ["chats.unmute", (w) => w.chats.unmute("acc_1", "+1"), "POST", `${A}/chats/%2B1/unmute`],
  ["chats.delete", (w) => w.chats.delete("acc_1", "+1", { deleteMedia: true }), "DELETE", `${A}/chats/%2B1?deleteMedia=true`],
  ["chats.setDisappearingTimer", (w) => w.chats.setDisappearingTimer("acc_1", "+1", 0), "PUT", `${A}/chats/%2B1/disappearing-timer`, { durationSeconds: 0 }],
  ["chats.addLabel", (w) => w.chats.addLabel("acc_1", "+1", "5"), "POST", `${A}/chats/%2B1/labels`, { labelId: "5" }],
  ["chats.removeLabel", (w) => w.chats.removeLabel("acc_1", "+1", "5"), "DELETE", `${A}/chats/%2B1/labels/5`],
  ["labels.upsert", (w) => w.labels.upsert("acc_1", "5", { name: "Paid", color: 3 }), "PUT", `${A}/labels/5`, { name: "Paid", color: 3 }],
  ["labels.delete", (w) => w.labels.delete("acc_1", "5"), "DELETE", `${A}/labels/5`],
  ["stories.create", (w) => w.stories.create("acc_1", { type: "text", text: "Hi" }), "POST", `${A}/stories`, { type: "text", text: "Hi" }],
  ["contacts.check", (w) => w.contacts.check("acc_1", ["+1"]), "POST", `${A}/contacts/check`, { phones: ["+1"] }],
  ["contacts.lookup", (w) => w.contacts.lookup("acc_1", ["+1"]), "POST", `${A}/contacts/lookup`, { contactIds: ["+1"] }],
  ["contacts.getPicture", (w) => w.contacts.getPicture("acc_1", "+1", { preview: true }), "GET", `${A}/contacts/%2B1/picture?preview=true`],
  ["contacts.getBusinessProfile", (w) => w.contacts.getBusinessProfile("acc_1", "+1"), "GET", `${A}/contacts/%2B1/business-profile`],
  ["contacts.subscribePresence", (w) => w.contacts.subscribePresence("acc_1", "+1"), "POST", `${A}/contacts/%2B1/subscribe-presence`],
  ["contacts.block", (w) => w.contacts.block("acc_1", "+1"), "POST", `${A}/contacts/%2B1/block`],
  ["contacts.unblock", (w) => w.contacts.unblock("acc_1", "+1"), "POST", `${A}/contacts/%2B1/unblock`],
  ["contacts.listBlocked", (w) => w.contacts.listBlocked("acc_1").page(), "GET", `${A}/blocklist`],
  ["contacts.getLink", (w) => w.contacts.getLink("acc_1"), "GET", `${A}/contact-link`],
  ["contacts.resetLink", (w) => w.contacts.resetLink("acc_1"), "POST", `${A}/contact-link/reset`],
  ["contacts.resolveLink", (w) => w.contacts.resolveLink("acc_1", { kind: "contact", code: "X" }), "POST", `${A}/links/resolve`, { kind: "contact", code: "X" }],
  ["bots.list", (w) => w.bots.list("acc_1").page(), "GET", `${A}/bots`],
  ["profile.update", (w) => w.profile.update("acc_1", { about: "Hi" }), "PATCH", `${A}/profile`, { about: "Hi" }],
  ["profile.setPicture", (w) => w.profile.setPicture("acc_1", { url: "https://x.test/a.jpg" }), "PUT", `${A}/profile/picture`, { url: "https://x.test/a.jpg" }],
  ["profile.deletePicture", (w) => w.profile.deletePicture("acc_1"), "DELETE", `${A}/profile/picture`],
  ["privacy.get", (w) => w.privacy.get("acc_1"), "GET", `${A}/privacy`],
  ["privacy.update", (w) => w.privacy.update("acc_1", { lastSeen: "contacts" }), "PATCH", `${A}/privacy`, { lastSeen: "contacts" }],
  ["privacy.getStoryPrivacy", (w) => w.privacy.getStoryPrivacy("acc_1"), "GET", `${A}/privacy/stories`],
  ["calls.reject", (w) => w.calls.reject("acc_1", "C1", { from: "+1" }), "POST", `${A}/calls/C1/reject`, { from: "+1" }],
  ["stickerPacks.get", (w) => w.stickerPacks.get("acc_1", "p1"), "GET", `${A}/sticker-packs/p1`],
  ["orders.get", (w) => w.orders.get("acc_1", "o1", { token: "t" }), "GET", `${A}/orders/o1?token=t`],
  ["messages.send", (w) => w.messages.send({ accountId: "acc_1", to: "99@newsletter", text: "v2" }), "POST", `${B}/v1/messages`, { accountId: "acc_1", to: "99@newsletter", text: "v2" }],
  ["messages.list", (w) => w.messages.list({ chatId: "stories" }).page(), "GET", `${B}/v1/messages?chatId=stories`],
  ["messages.get", (w) => w.messages.get("m1"), "GET", `${B}/v1/messages/m1`],
  ["messages.edit", (w) => w.messages.edit("m1", "x"), "PATCH", `${B}/v1/messages/m1`, { text: "x" }],
  ["messages.delete", (w) => w.messages.delete("m1"), "DELETE", `${B}/v1/messages/m1`],
  ["messages.react", (w) => w.messages.react("m1", "👍"), "POST", `${B}/v1/messages/m1/react`, { emoji: "👍" }],
  ["messages.vote", (w) => w.messages.vote("m1", ["Sushi"]), "POST", `${B}/v1/messages/m1/vote`, { options: ["Sushi"] }],
  ["messages.star", (w) => w.messages.star("m1"), "POST", `${B}/v1/messages/m1/star`],
  ["messages.unstar", (w) => w.messages.unstar("m1"), "POST", `${B}/v1/messages/m1/unstar`],
  ["messages.addLabel", (w) => w.messages.addLabel("m1", "5"), "POST", `${B}/v1/messages/m1/labels`, { labelId: "5" }],
  ["messages.removeLabel", (w) => w.messages.removeLabel("m1", "5"), "DELETE", `${B}/v1/messages/m1/labels/5`],
  ["groups.list", (w) => w.groups.list("acc_1", { limit: 10 }).page(), "GET", `${A}/groups?limit=10`],
  ["groups.create", (w) => w.groups.create("acc_1", { name: "Team", participants: ["+1"] }), "POST", `${A}/groups`, { name: "Team", participants: ["+1"] }],
  ["groups.get", (w) => w.groups.get("acc_1", "123@g.us"), "GET", G],
  ["groups.update", (w) => w.groups.update("acc_1", "123@g.us", { memberAddMode: "admins" }), "PATCH", G, { memberAddMode: "admins" }],
  ["groups.leave", (w) => w.groups.leave("acc_1", "123@g.us"), "POST", `${G}/leave`],
  ["groups.addParticipants", (w) => w.groups.addParticipants("acc_1", "123@g.us", ["+1"]), "POST", `${G}/participants/add`, { contactIds: ["+1"] }],
  ["groups.removeParticipants", (w) => w.groups.removeParticipants("acc_1", "123@g.us", ["+1"]), "POST", `${G}/participants/remove`, { contactIds: ["+1"] }],
  ["groups.promoteParticipants", (w) => w.groups.promoteParticipants("acc_1", "123@g.us", ["+1"]), "POST", `${G}/participants/promote`, { contactIds: ["+1"] }],
  ["groups.demoteParticipants", (w) => w.groups.demoteParticipants("acc_1", "123@g.us", ["+1"]), "POST", `${G}/participants/demote`, { contactIds: ["+1"] }],
  ["groups.getInviteLink", (w) => w.groups.getInviteLink("acc_1", "123@g.us"), "GET", `${G}/invite-link`],
  ["groups.join", (w) => w.groups.join("acc_1", "AbC"), "POST", `${A}/groups/join`, { code: "AbC" }],
  ["groups.getInvite", (w) => w.groups.getInvite("acc_1", "AbC"), "GET", `${A}/groups/invites/AbC`],
  ["groups.setPicture", (w) => w.groups.setPicture("acc_1", "123@g.us", { base64: "AA" }), "PUT", `${G}/picture`, { base64: "AA" }],
  ["groups.deletePicture", (w) => w.groups.deletePicture("acc_1", "123@g.us"), "DELETE", `${G}/picture`],
  ["groups.listJoinRequests", (w) => w.groups.listJoinRequests("acc_1", "123@g.us").page(), "GET", `${G}/join-requests`],
  ["groups.approveJoinRequests", (w) => w.groups.approveJoinRequests("acc_1", "123@g.us", ["+1"]), "POST", `${G}/join-requests/approve`, { contactIds: ["+1"] }],
  ["groups.rejectJoinRequests", (w) => w.groups.rejectJoinRequests("acc_1", "123@g.us", ["+1"]), "POST", `${G}/join-requests/reject`, { contactIds: ["+1"] }],
  ["groups.listSubgroups", (w) => w.groups.listSubgroups("acc_1", "123@g.us").page(), "GET", `${G}/subgroups`],
  ["groups.linkSubgroup", (w) => w.groups.linkSubgroup("acc_1", "123@g.us", "456@g.us"), "POST", `${G}/subgroups`, { groupId: "456@g.us" }],
  ["groups.unlinkSubgroup", (w) => w.groups.unlinkSubgroup("acc_1", "123@g.us", "456@g.us"), "DELETE", `${G}/subgroups/456%40g.us`],
  ["groups.listCommunityParticipants", (w) => w.groups.listCommunityParticipants("acc_1", "123@g.us").page(), "GET", `${G}/community-participants`],
  ["channels.list", (w) => w.channels.list("acc_1").page(), "GET", `${A}/channels`],
  ["channels.create", (w) => w.channels.create("acc_1", { name: "News" }), "POST", `${A}/channels`, { name: "News" }],
  ["channels.get", (w) => w.channels.get("acc_1", "99@newsletter"), "GET", CH],
  ["channels.getInvite", (w) => w.channels.getInvite("acc_1", "0029Va"), "GET", `${A}/channels/invites/0029Va`],
  ["channels.follow", (w) => w.channels.follow("acc_1", "99@newsletter"), "POST", `${CH}/follow`],
  ["channels.unfollow", (w) => w.channels.unfollow("acc_1", "99@newsletter"), "POST", `${CH}/unfollow`],
  ["channels.mute", (w) => w.channels.mute("acc_1", "99@newsletter"), "POST", `${CH}/mute`],
  ["channels.unmute", (w) => w.channels.unmute("acc_1", "99@newsletter"), "POST", `${CH}/unmute`],
  ["channels.listMessages", (w) => w.channels.listMessages("acc_1", "99@newsletter", { limit: 20, cursor: "140" }).page(), "GET", `${CH}/messages?limit=20&cursor=140`],
  ["channels.react", (w) => w.channels.react("acc_1", "99@newsletter", "142", "🎉"), "POST", `${CH}/messages/142/react`, { emoji: "🎉" }],
  ["channels.markViewed", (w) => w.channels.markViewed("acc_1", "99@newsletter", ["141", "142"]), "POST", `${CH}/mark-viewed`, { channelMessageIds: ["141", "142"] }],
  ["webhookEndpoints.list", (w) => w.webhookEndpoints.list().page(), "GET", `${B}/v1/webhook-endpoints`],
  ["webhookEndpoints.create", (w) => w.webhookEndpoints.create({ url: "https://x.test", events: ["message.received"] }), "POST", `${B}/v1/webhook-endpoints`, { url: "https://x.test", events: ["message.received"] }],
  ["webhookEndpoints.get", (w) => w.webhookEndpoints.get("w1"), "GET", `${B}/v1/webhook-endpoints/w1`],
  ["webhookEndpoints.update", (w) => w.webhookEndpoints.update("w1", { active: false }), "PATCH", `${B}/v1/webhook-endpoints/w1`, { active: false }],
  ["webhookEndpoints.delete", (w) => w.webhookEndpoints.delete("w1"), "DELETE", `${B}/v1/webhook-endpoints/w1`],
  ["webhookEndpoints.rotateSecret", (w) => w.webhookEndpoints.rotateSecret("w1"), "POST", `${B}/v1/webhook-endpoints/w1/rotate-secret`],
  ["projects.list", (w) => w.projects.list({ status: "active" }).page(), "GET", `${B}/v1/projects?status=active`],
  ["projects.create", (w) => w.projects.create({ name: "N" }), "POST", `${B}/v1/projects`, { name: "N" }],
  ["projects.get", (w) => w.projects.get("ext:c_1"), "GET", `${B}/v1/projects/ext%3Ac_1`],
  ["projects.update", (w) => w.projects.update("p1", { status: "suspended" }), "PATCH", `${B}/v1/projects/p1`, { status: "suspended" }],
  ["projects.delete", (w) => w.projects.delete("p1"), "DELETE", `${B}/v1/projects/p1`],
  ["projects.getUsage", (w) => w.projects.getUsage("p1"), "GET", `${B}/v1/projects/p1/usage`],
  ["projects.apiKeys.list", (w) => w.projects.apiKeys.list("p1").page(), "GET", `${B}/v1/projects/p1/api-keys`],
  ["projects.apiKeys.create", (w) => w.projects.apiKeys.create("p1", { name: "K" }), "POST", `${B}/v1/projects/p1/api-keys`, { name: "K" }],
  ["projects.apiKeys.revoke", (w) => w.projects.apiKeys.revoke("p1", "k1"), "DELETE", `${B}/v1/projects/p1/api-keys/k1`],
  ["invitations.create", (w) => w.invitations.create({ methods: ["pairing_code"], proxyLocation: { country: "MX", city: "mexico_city" } }), "POST", `${B}/v1/invitations`, { methods: ["pairing_code"], proxyLocation: { country: "MX", city: "mexico_city" } }],
  ["invitations.list", (w) => w.invitations.list({ status: "cancelled" }).page(), "GET", `${B}/v1/invitations?status=cancelled`],
  ["invitations.get", (w) => w.invitations.get("i1"), "GET", `${B}/v1/invitations/i1`],
  ["invitations.cancel", (w) => w.invitations.cancel("i1"), "POST", `${B}/v1/invitations/i1/cancel`],
  ["invitations.resend", (w) => w.invitations.resend("i1"), "POST", `${B}/v1/invitations/i1/resend`],
  ["branding.get", (w) => w.branding.get(), "GET", `${B}/v1/branding`],
  ["branding.update", (w) => w.branding.update({ displayName: "N" }), "PATCH", `${B}/v1/branding`, { displayName: "N" }],
];

describe("every method hits its catalog route", () => {
  it.each(CASES)("%s", async (_label, run, method, url, body) => {
    const reply = method === "DELETE" ? { status: 204 } : url.includes("/check") || url.includes("/lookup") || url.includes("/participants/") || url.includes("/join-requests/") ? list : { status: 200, body: {} };
    const { fetch, calls } = mockFetch([reply]);
    await run(new Wuapi({ apiKey: KEY, fetch }));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe(method);
    expect(calls[0]!.url).toBe(url);
    expect(calls[0]!.body).toEqual(body);
    if (method === "POST") expect(calls[0]!.headers["Idempotency-Key"]).toBeTruthy();
    else expect(calls[0]!.headers["Idempotency-Key"]).toBeUndefined();
  });

  it("passes an explicit idempotency key and abort signal through", async () => {
    const { fetch, calls } = mockFetch([{ status: 201, body: {} }]);
    const controller = new AbortController();
    await new Wuapi({ apiKey: KEY, fetch }).projects.create({ name: "N" }, { idempotencyKey: "prj-N", signal: controller.signal });
    expect(calls[0]!.headers["Idempotency-Key"]).toBe("prj-N");
  });

  it("sends Wuapi-Project from a project-scoped client", async () => {
    const { fetch, calls } = mockFetch([list]);
    await new Wuapi({ apiKey: KEY, fetch }).withProject("ext:c_1").accounts.list().page();
    expect(calls[0]!.headers["Wuapi-Project"]).toBe("ext:c_1");
  });
});
