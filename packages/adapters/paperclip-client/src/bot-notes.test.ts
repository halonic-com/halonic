import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { chatTask, company, me } from "./acme-data.test-helper.ts";
import { connect, FakePaperclip, type Network, sourceId } from "./fake-paperclip.test-helper.ts";

let paperclip: FakePaperclip;
let warnings: string[];
const network: Network = { offline: false };
const chat = `${sourceId}:chat:${chatTask}`;
const notesRoute = `/api/plugins/halonic.agent-tools/api/chat-notes/${chatTask}`;

/** A comment with no author, as the front bot posts it; `id` decides whether the bot did. */
function unsigned(id: string, at: string) {
  return { id, body: "*Assistant:* Ada's on it.", createdAt: at };
}

/** The chat, newest first: the bot's note, a look-alike, and the person's question. */
const comments = [
  unsigned("m3", "2026-11-24T10:03:00.000Z"),
  unsigned("m2", "2026-11-24T10:02:00.000Z"),
  { id: "m1", body: "Is 0.3 ready?", authorUserId: me, createdAt: "2026-11-24T10:01:00.000Z" },
];

/** Serves Acme with the chat holding `chatComments`, the bot's route answering `notes`. */
function serve(chatComments: unknown[], notes: { status?: number; body?: unknown }) {
  paperclip
    .serveAcme()
    .on("GET", `/api/issues/${chatTask}/comments`, { body: chatComments })
    .on("GET", notesRoute, notes);
}

/** The chat's messages, after listing the chats so the client knows the chat's agent. */
async function listed() {
  const messaging = connect(paperclip, network, (message) => warnings.push(message));
  await messaging.listConversations();
  return messaging.listMessages(chat);
}

const reads = () => paperclip.seen.filter((request) => request.path === notesRoute);

beforeEach(() => {
  network.offline = false;
  paperclip = new FakePaperclip();
  warnings = [];
});

verifies("paperclip-client.bot-notes", () => {
  describe("the front bot's notes", () => {
    it("are the chat agent's automatic messages; a look-alike not in the list stays Board's", async () => {
      serve(comments, { body: { automaticNotes: [{ commentId: "m3" }], progressNotes: null } });
      const [question, lookAlike, note] = await listed();
      expect(note).toMatchObject({ author: { kind: "agent", name: "Ada" }, automatic: true });
      expect(lookAlike?.author).toEqual({ kind: "person", name: "Board" });
      expect(lookAlike?.automatic).toBeUndefined();
      expect(question?.author).toEqual({ kind: "me" });
      expect(reads()[0]?.query.get("companyId")).toBe(company);
      expect(warnings).toEqual([]);
    });

    it("cost no read when every comment has an author", async () => {
      serve([comments[2]], { body: { automaticNotes: [] } });
      await listed();
      expect(reads()).toHaveLength(0);
    });

    it("leave the chat as it is when the plugin isn't there or the read fails", async () => {
      serve(comments, { status: 404 });
      expect((await listed()).map((message) => message.automatic)).toEqual([
        undefined,
        undefined,
        undefined,
      ]);
      expect(warnings).toEqual([]);
      serve(comments, { status: 500 });
      expect((await listed()).some((message) => message.automatic)).toBe(false);
      expect(warnings).toHaveLength(1);
    });
  });
});
