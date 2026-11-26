import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { company, me, testKey } from "./acme-data.test-helper.ts";
import { PaperclipMessaging } from "./client.ts";
import { FakePaperclip, testNow } from "./fake-paperclip.test-helper.ts";

/** How many agents, each with one chat, the company has. */
const chatCount = 15;

/** A Paperclip with 15 agents, each with a chat holding the person's question and its answer. */
function fifteenChats(): FakePaperclip {
  const paperclip = new FakePaperclip();
  const agents = Array.from({ length: chatCount }, (_, index) => ({
    id: `agent-${index}`,
    name: `Agent ${index}`,
  }));
  const chats = agents.map((agent, index) => ({
    id: `chat-${index}`,
    title: `Chat ${index}`,
    conversationAgentId: agent.id,
    conversationState: "waiting",
    updatedAt: "2026-11-24T10:05:00.000Z",
  }));
  paperclip
    .on("GET", `/api/companies/${company}/agents`, { body: agents })
    .on("GET", `/api/companies/${company}/chats`, { body: chats })
    .on("GET", `/api/companies/${company}/issues`, { body: [] })
    .on("GET", `/api/companies/${company}/live-runs`, { body: [] })
    .on("GET", "/api/cli-auth/me", { body: { userId: me } });
  for (const [index, chat] of chats.entries()) {
    paperclip
      .on("GET", `/api/issues/${chat.id}/comments`, {
        body: [
          {
            id: `answer-${index}`,
            body: "Done",
            authorAgentId: chat.conversationAgentId,
            createdAt: "2026-11-24T10:04:00.000Z",
          },
          {
            id: `question-${index}`,
            body: "Can you?",
            authorUserId: me,
            createdAt: "2026-11-24T10:03:00.000Z",
          },
        ],
      })
      .on("GET", `/api/issues/${chat.id}/runs`, { body: [] })
      .on("GET", `/api/plugins/halonic.agent-tools/api/chat-notes/${chat.id}`, {
        body: { automaticNotes: [], progressNotes: null },
      });
  }
  return paperclip;
}

/** How many requests went to each path, with the chat's ID left out. */
function requestsByRoute(paperclip: FakePaperclip): Map<string, number> {
  const counts = new Map<string, number>();
  for (const seen of paperclip.seen) {
    const route = seen.path.replace(/chat-\d+/, ":chat");
    counts.set(route, (counts.get(route) ?? 0) + 1);
  }
  return counts;
}

verifies("paperclip-client.shared-reads", () => {
  describe("reading every chat at once", () => {
    it("asks Paperclip once for the user and once for the agents, then three reads per chat", async () => {
      const paperclip = fifteenChats();
      // The hosts name no user, so the provider reads it itself.
      const client = new PaperclipMessaging({
        address: paperclip.address,
        key: testKey,
        connection: "acme",
        company,
        label: "Paperclip · Acme",
        now: () => testNow,
        fetch: paperclip.fetch,
      });
      const conversations = await client.listConversations();
      paperclip.seen.length = 0;

      const read = await Promise.all(conversations.map((each) => client.listMessages(each.id)));

      expect(read.map((messages) => messages.map((message) => message.author.kind))).toEqual(
        Array.from({ length: chatCount }, () => ["me", "agent"]),
      );
      const counts = requestsByRoute(paperclip);
      expect(counts.get("/api/cli-auth/me")).toBe(1);
      expect(counts.get(`/api/companies/${company}/agents`)).toBe(1);
      // Each chat: its comments, its runs for read receipts, and the front bot's notes.
      expect(paperclip.seen).toHaveLength(2 + 3 * chatCount);
    });
  });
});
