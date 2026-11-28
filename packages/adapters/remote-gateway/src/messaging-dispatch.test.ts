import { gatewayMaxSearchLength } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { openConnection, settle } from "./connection.test-helper.ts";
import {
  acmeSource,
  allPortMembers,
  FakePhoneMessaging,
  inboxItem,
} from "./messaging.test-helper.ts";

/** A connected phone on a fake view, past `hello`. */
async function connect(options: { allowRisky?: boolean } = {}) {
  const fake = new FakePhoneMessaging();
  const t = openConnection({ ...options, messaging: fake.gateway() });
  await t.hello();
  return { ...t, fake };
}

const answerYes = { kind: "option", option: "yes" } as const;

/** One of each message the phone may send, and the members each may call. */
const everyAllowedMessage = [
  { type: "msg-read", id: "r1", what: "sources" },
  { type: "msg-read", id: "r2", what: "agents" },
  { type: "msg-read", id: "r3", what: "conversations" },
  { type: "msg-read", id: "r4", what: "inbox" },
  { type: "msg-read", id: "r5", what: "work" },
  { type: "msg-read", id: "r6", what: "messages", conversation: "conv-1" },
  { type: "msg-search", id: "s1", text: "launch" },
  { type: "msg-answer", id: "a1", item: "item-1", answer: answerYes, confirmed: true },
  { type: "msg-send", id: "m1", conversation: "conv-1", body: "Go", to: ["agent-bo"] },
  { type: "msg-watch", id: "w1" },
  { type: "msg-unwatch", id: "w2" },
  { type: "team-read", id: "t1", what: "parts" },
  { type: "team-read", id: "t2", what: "spend", range: "week" },
  { type: "team-read", id: "t3", what: "seats" },
  { type: "team-read", id: "t4", what: "pull-requests" },
  { type: "team-read", id: "t5", what: "queue" },
  { type: "team-read", id: "t6", what: "pull-request", pullRequest: "pr-1" },
];

const allowedMembers = [
  "listSources",
  "listAgents",
  "listConversations",
  "listMessages",
  "listInboxItems",
  "listWork",
  "search",
  "answer",
  "send",
  "changes",
  "parts",
  "spend",
  "seats",
  "pullRequests",
  "pullRequest",
  "mergeQueue",
];

verifies("remote-gateway.messaging-allow-list", () => {
  describe("the dispatcher table", () => {
    it.each([...allPortMembers, "msg-start-channel", "fetch", "read-secret"])(
      "closes with malformed on %s and calls nothing",
      async (type) => {
        const t = await connect();
        await t.say({ type, id: "x1" });
        expect(t.sent.at(-1)).toEqual({ type: "error", code: "malformed" });
        expect(t.transport.closed).toBe(true);
        expect(t.fake.calls).toEqual([]);
      },
    );

    it("serves every allowed message from the view's allowed members only", async () => {
      const t = await connect();
      for (const message of everyAllowedMessage) await t.say(message);
      const replies = t.sent.slice(1).filter((sent) => "replyTo" in sent);
      expect(replies.map((sent) => ("replyTo" in sent ? sent.replyTo : ""))).toEqual(
        everyAllowedMessage.map((message) => message.id),
      );
      expect(replies.some((sent) => sent.type === "error")).toBe(false);
      expect(new Set(t.fake.calls)).toEqual(new Set(allowedMembers));
    });

    it("refuses every version 4 message with not-supported when the host gives no view", async () => {
      const t = openConnection();
      await t.hello();
      await t.say({ type: "msg-search", id: "s1", text: "launch" });
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "s1", code: "not-supported" });
    });
  });

  describe("answers", () => {
    it.each(["offline", "signed-out"] as const)(
      "refuses an item whose source is %s, and never calls answer",
      async (kind) => {
        const t = await connect();
        t.fake.source = {
          ...acmeSource,
          state: kind === "offline" ? { kind, asOf: "2026-11-25T08:00:00Z" } : { kind },
        };
        await t.say(everyAllowedMessage[7]);
        expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "a1", code: kind });
        expect(t.fake.calls).not.toContain("answer");
      },
    );

    it.each(["offline", "signed-out"] as const)(
      "refuses with %s when the inbox read fails and no source is online (HAL-19053)",
      async (kind) => {
        const t = await connect();
        t.fake.source = {
          ...acmeSource,
          state: kind === "offline" ? { kind, asOf: "2026-11-25T08:00:00Z" } : { kind },
        };
        t.fake.inboxFailure = new TypeError("fetch failed");
        await t.say(everyAllowedMessage[7]);
        expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "a1", code: kind });
        expect(t.transport.closed).toBe(false);
        expect(t.fake.calls).not.toContain("answer");
      },
    );

    it("keeps a failed inbox read a failure while a source is online", async () => {
      const t = await connect();
      t.fake.inboxFailure = new Error("broken provider");
      await t.say(everyAllowedMessage[7]);
      await settle();
      expect(t.transport.closed).toBe(true);
      expect(t.fake.calls).not.toContain("answer");
    });

    it("refuses a risky item with the switch off, reading the switch for each answer", async () => {
      const t = await connect();
      t.fake.item = inboxItem("risky");
      await t.say(everyAllowedMessage[7]);
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "a1", code: "not-allowed-remotely" });
      expect(t.fake.calls).not.toContain("answer");
      t.risky.allowed = true;
      await t.say({ ...everyAllowedMessage[7], id: "a2" });
      expect(t.sent.at(-1)).toMatchObject({ type: "msg-result", replyTo: "a2" });
    });

    it("treats any risk but normal as risky, so the check fails closed", async () => {
      const t = await connect();
      t.fake.item = { ...inboxItem(), risk: "unknown" as "risky" };
      await t.say(everyAllowedMessage[7]);
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "a1", code: "not-allowed-remotely" });
      expect(t.fake.calls).not.toContain("answer");
    });

    it("refuses an item the view doesn't have with not-found", async () => {
      const t = await connect();
      await t.say({ ...everyAllowedMessage[7], item: "item-9" });
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "a1", code: "not-found" });
    });
  });

  describe("sends", () => {
    it("refuses a to outside the conversation before the provider is called", async () => {
      const t = await connect();
      await t.say({ ...everyAllowedMessage[8], to: ["agent-bo", "agent-cy"] });
      expect(t.sent.at(-1)).toEqual({
        type: "error",
        replyTo: "m1",
        code: "not-allowed-from-phone",
      });
      expect(t.fake.calls).not.toContain("send");
    });

    it("sends with the checked to and no attachments", async () => {
      const t = await connect();
      await t.say(everyAllowedMessage[8]);
      expect(t.fake.sent).toEqual([["conv-1", "Go", undefined, { to: ["agent-bo"] }]]);
    });

    it("passes a port refusal on as its own code, and any other one in the result", async () => {
      const t = await connect();
      t.fake.sendResult = { outcome: "refused", reason: "not-found" };
      await t.say(everyAllowedMessage[8]);
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "m1", code: "not-found" });
      t.fake.sendResult = { outcome: "refused", reason: "too-large" };
      await t.say({ ...everyAllowedMessage[8], id: "m2" });
      expect(t.sent.at(-1)).toEqual({
        type: "msg-result",
        replyTo: "m2",
        result: t.fake.sendResult,
      });
    });
  });

  describe("rate and size", () => {
    it("closes with malformed on a search over 200 code units", async () => {
      const t = await connect();
      await t.say({ type: "msg-search", id: "s1", text: "a".repeat(gatewayMaxSearchLength + 1) });
      expect(t.sent.at(-1)).toEqual({ type: "error", code: "malformed" });
      expect(t.fake.calls).toEqual([]);
    });

    it("refuses a search or a send over the phone's rate before the provider is called", async () => {
      const t = await connect();
      t.fake.left.search = 0;
      t.fake.left.send = 0;
      await t.say(everyAllowedMessage[6]);
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "s1", code: "rate-limited" });
      await t.say(everyAllowedMessage[8]);
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "m1", code: "rate-limited" });
      expect(t.fake.calls).not.toContain("search");
      expect(t.fake.calls).not.toContain("send");
      expect(t.transport.closed).toBe(false);
    });

    it("refuses a pull request read over the phone's reactions reads before the hub is asked", async () => {
      const t = await connect();
      t.fake.left.reactions = 0;
      await t.say({ type: "team-read", id: "t6", what: "pull-request", pullRequest: "pr-1" });
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "t6", code: "rate-limited" });
      expect(t.fake.calls).not.toContain("pullRequest");
    });
  });

  describe("pages and pushes", () => {
    it("reads a conversation newest first, and closes on a cursor the host never made", async () => {
      const t = await connect();
      await t.say(everyAllowedMessage[5]);
      const page = t.sent.at(-1);
      expect(
        page?.type === "msg-data" && page.items.map((item) => (item as { id: string }).id),
      ).toEqual(["msg-3", "msg-2", "msg-1"]);
      await t.say({ ...everyAllowedMessage[5], id: "r7", before: "4" });
      expect(t.sent.at(-1)).toEqual({ type: "error", code: "malformed" });
    });

    it("refuses the messages of a conversation the view doesn't list, before reading them", async () => {
      const t = await connect();
      await t.say({ ...everyAllowedMessage[5], conversation: "conv-9" });
      expect(t.sent.at(-1)).toEqual({ type: "error", replyTo: "r6", code: "not-found" });
      expect(t.fake.calls).not.toContain("listMessages");
    });

    it("pushes msg-changed while watched, and nothing after msg-unwatch", async () => {
      const t = await connect();
      await t.say(everyAllowedMessage[9]);
      t.fake.change("src-acme");
      await settle();
      expect(t.sent.filter((sent) => sent.type === "msg-changed").length).toBeGreaterThan(0);
      await t.say(everyAllowedMessage[10]);
      const before = t.sent.length;
      t.fake.change("src-acme");
      await settle();
      expect(t.sent.length).toBe(before);
    });
  });
});
