import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { chatTask, company, me, testKey } from "./acme-data.test-helper.ts";
import { PaperclipMessaging } from "./client.ts";
import {
  connect,
  type FakeAnswer,
  FakePaperclip,
  testNow as now,
  sourceId as source,
} from "./fake-paperclip.test-helper.ts";

let paperclip: FakePaperclip;

beforeEach(() => {
  paperclip = new FakePaperclip();
});

const chat = `${source}:chat:${chatTask}`;
const whoAmIPath = "/api/cli-auth/me";

/** A client made as the hosts make it: with no user, so it has to ask Paperclip whose key it holds. */
const clientWithNoUser = () =>
  new PaperclipMessaging({
    address: paperclip.address,
    key: testKey,
    connection: "acme",
    company,
    label: "Paperclip · Acme",
    now: () => now,
    fetch: paperclip.fetch,
  });

const whoAmI: FakeAnswer = {
  body: { userId: me, companyIds: [company], user: { name: "Acme Board" } },
};

const whoAmIReads = () => paperclip.seen.filter((request) => request.path === whoAmIPath).length;

/** Answers a comment on the chat as Paperclip does: written by the key's user. */
function confirmComments(): void {
  paperclip.on("POST", `/api/issues/${chatTask}/comments`, ({ body }) => ({
    body: {
      id: "m3",
      body: (body as { body: string }).body,
      authorUserId: me,
      createdAt: "2026-11-24T10:12:00.000Z",
    },
  }));
}

verifies("paperclip-client.own-messages", () => {
  describe("the person's own messages", () => {
    it("keeps a sent message the person's once Paperclip confirms it, with no user given", async () => {
      paperclip.serveAcme().on("GET", whoAmIPath, whoAmI);
      confirmComments();
      const messaging = clientWithNoUser();

      const sent = await messaging.send(chat, "On it");

      expect(sent).toMatchObject({ outcome: "sent", message: { author: { kind: "me" } } });
      const read = await messaging.listMessages(chat);
      const own = read.filter((message) => message.author.kind === "me").map((m) => m.body);
      expect(own).toEqual(["Hello Ada"]);
      expect(read.some((message) => message.author.kind === "person")).toBe(false);
      expect(whoAmIReads()).toBe(1);
    });

    it("lists the messages while it can't tell whose key it is, and asks again next time", async () => {
      paperclip.serveAcme().on("GET", whoAmIPath, { status: 500, body: {} });
      const messaging = clientWithNoUser();

      const first = await messaging.listMessages(chat);

      expect(first.length).toBeGreaterThan(0);
      expect(first.some((message) => message.author.kind === "me")).toBe(false);
      paperclip.on("GET", whoAmIPath, whoAmI);
      const second = await messaging.listMessages(chat);
      expect(second.some((message) => message.author.kind === "me")).toBe(true);
      expect(whoAmIReads()).toBe(2);
    });

    it("uses the user the host names, with no read of whose key it is", async () => {
      paperclip.serveAcme();
      const messages = await connect(paperclip, { offline: false }).listMessages(chat);

      expect(messages.some((message) => message.author.kind === "me")).toBe(true);
      expect(whoAmIReads()).toBe(0);
    });
  });
});
