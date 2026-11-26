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

/** The person's question from a week ago: the plugin has dropped any progress notes on it. */
const lastWeek = {
  id: "m0",
  body: "Is 0.2 ready?",
  authorUserId: me,
  createdAt: "2026-11-17T10:01:00.000Z",
};

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

    it("cost no read when every comment has an author and the person's is over a day old", async () => {
      serve([lastWeek], { body: { automaticNotes: [] } });
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

/** A progress note as the route serves it, for run `r1`. */
function progress(notes: readonly { at: string; text: string }[]) {
  return { automaticNotes: [], progressNotes: { runId: "r1", notes } };
}

/** A note that would be bold, HTML and a script link if anything read it as markup. */
const markup = "**x** <b>y</b> [z](javascript:1)";

verifies("paperclip-client.progress-notes", () => {
  describe("the front bot's progress notes", () => {
    it("are the chat agent's automatic messages, their text exactly as the route gave it", async () => {
      serve([comments[2]], { body: progress([{ at: "2026-11-24T10:02:00.000Z", text: markup }]) });
      const [question, note] = await listed();
      expect(question?.author).toEqual({ kind: "me" });
      expect(note).toMatchObject({
        conversation: chat,
        author: { kind: "agent", name: "Ada" },
        body: markup,
        sentAt: "2026-11-24T10:02:00.000Z",
        automatic: true,
        plainText: true,
        attachments: [],
      });
      expect(note?.body).toBe("**x** <b>y</b> [z](javascript:1)");
      expect(reads()[0]?.query.get("companyId")).toBe(company);
    });

    it("go in time order among the comments; a broken note is left out", async () => {
      const notes = [
        { at: "2026-11-24T10:02:30.000Z", text: "Reading the release checklist." },
        { at: "2026-11-24T10:01:30.000Z", text: "Looking at PR #6129." },
        { at: "not a time", text: "Lost." },
        { at: "2026-11-24T10:04:00.000Z", text: "   " },
      ];
      serve(comments, { body: { ...progress(notes), automaticNotes: [{ commentId: "m3" }] } });
      const bodies = (await listed()).map((message) => [message.body, message.plainText]);
      expect(bodies).toEqual([
        ["Is 0.3 ready?", undefined],
        ["Looking at PR #6129.", true],
        ["*Assistant:* Ada's on it.", undefined],
        ["Reading the release checklist.", true],
        ["*Assistant:* Ada's on it.", undefined],
      ]);
    });

    it("are none for a chat with no notes", async () => {
      serve([comments[2]], { body: { automaticNotes: [], progressNotes: null } });
      const messages = await listed();
      expect(messages.filter((message) => message.plainText === true)).toEqual([]);
      expect(messages.map((message) => message.body)).toEqual(["Is 0.3 ready?"]);
      expect(reads()).toHaveLength(1);
      expect(warnings).toEqual([]);
    });
  });
});
