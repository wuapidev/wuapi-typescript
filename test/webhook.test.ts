import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeSignature, verifyWebhook, WebhookVerificationError, type WebhookEvent } from "../src/index.js";

const SECRET = "whsec_" + "b".repeat(48);
const body = JSON.stringify({
  id: "evt_1",
  object: "event",
  type: "message.received",
  createdAt: "2026-09-24T09:05:00.000Z",
  organizationId: "org_1",
  projectId: null,
  data: { object: { object: "message", id: "msg_1", text: "hello" } },
});

const now = () => Math.floor(Date.now() / 1000);
const sign = (t: number, raw = body, secret = SECRET) =>
  createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");

describe("verifyWebhook", () => {
  it("accepts a valid signature and returns the typed event", async () => {
    const t = now();
    const event: WebhookEvent = await verifyWebhook(body, `t=${t},v1=${sign(t)}`, SECRET);
    expect(event.type).toBe("message.received");
    if (event.type === "message.received") {
      expect(event.data.object.id).toBe("msg_1");
    }
  });

  it("matches the Node HMAC implementation", async () => {
    expect(await computeSignature(SECRET, 1758704400, body)).toBe(sign(1758704400));
  });

  it("accepts when any of several v1 signatures matches", async () => {
    const t = now();
    const header = `t=${t},v1=${"0".repeat(64)},v1=${sign(t)}`;
    await expect(verifyWebhook(body, header, SECRET)).resolves.toMatchObject({ id: "evt_1" });
  });

  it("rejects a tampered body", async () => {
    const t = now();
    await expect(verifyWebhook(body.replace("hello", "hellO"), `t=${t},v1=${sign(t)}`, SECRET)).rejects.toThrow(
      WebhookVerificationError,
    );
  });

  it("rejects the wrong secret", async () => {
    const t = now();
    await expect(verifyWebhook(body, `t=${t},v1=${sign(t, body, "whsec_other")}`, SECRET)).rejects.toThrow(
      /does not match/,
    );
  });

  it("rejects a stale timestamp", async () => {
    const t = now() - 301;
    await expect(verifyWebhook(body, `t=${t},v1=${sign(t)}`, SECRET)).rejects.toThrow(/tolerance/);
  });

  it("honors a custom tolerance", async () => {
    const t = now() - 400;
    await expect(verifyWebhook(body, `t=${t},v1=${sign(t)}`, SECRET, 600)).resolves.toMatchObject({ id: "evt_1" });
  });

  it("rejects missing or malformed headers", async () => {
    await expect(verifyWebhook(body, null, SECRET)).rejects.toThrow(/Missing/);
    await expect(verifyWebhook(body, "v1=abc", SECRET)).rejects.toThrow(/Malformed/);
    await expect(verifyWebhook(body, `t=${now()}`, SECRET)).rejects.toThrow(/Malformed/);
    await expect(verifyWebhook(body, `t=abc,v1=${sign(now())}`, SECRET)).rejects.toThrow(/Malformed/);
  });
});

describe("verifyWebhook on projects and capability events", () => {
  it("returns a typed invitation.status_changed event with previousAttributes", async () => {
    const raw = JSON.stringify({
      id: "evt_2",
      object: "event",
      type: "invitation.status_changed",
      createdAt: "2026-09-24T09:05:00.000Z",
      organizationId: "org_1",
      projectId: "prj_1",
      data: {
        object: { object: "invitation", id: "inv_1", url: null, accountId: "acc_1", projectId: "prj_1", status: "completed", methods: ["qr_code", "pairing_code"] },
        previousAttributes: { status: "in_progress" },
      },
    });
    const t = now();
    const event = await verifyWebhook(raw, `t=${t},v1=${sign(t, raw)}`, SECRET);
    expect(event.projectId).toBe("prj_1");
    if (event.type !== "invitation.status_changed") throw new Error("wrong type");
    expect(event.data.object.status).toBe("completed");
    expect(event.data.object.accountId).toBe("acc_1");
    expect(event.data.previousAttributes.status).toBe("in_progress");
  });

  it("returns a typed call.received event", async () => {
    const raw = JSON.stringify({
      id: "evt_3",
      object: "event",
      type: "call.received",
      createdAt: "2026-09-24T09:05:00.000Z",
      organizationId: "org_1",
      projectId: null,
      data: {
        object: { object: "call", id: "CALL1", accountId: "acc_1", from: "+584241112233", video: false, groupId: null, endReason: null, startedAt: "2026-09-24T09:05:00.000Z", endedAt: null },
      },
    });
    const t = now();
    const event = await verifyWebhook(raw, `t=${t},v1=${sign(t, raw)}`, SECRET);
    if (event.type !== "call.received") throw new Error("wrong type");
    expect(event.data.object.from).toBe("+584241112233");
    expect(event.projectId).toBeNull();
  });
});
