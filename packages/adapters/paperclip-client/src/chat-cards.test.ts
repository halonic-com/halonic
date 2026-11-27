import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, expect, it } from "vitest";
import { acmeData, agentAda, chatTask, company } from "./acme-data.test-helper.ts";
import { cardId, connect, FakePaperclip, type Network } from "./fake-paperclip.test-helper.ts";

const chatCard = "f0000000-0000-4000-8000-000000000030";
const chatCardsPath = `/api/issues/${chatTask}/interactions`;

let paperclip: FakePaperclip;
const network: Network = { offline: false };

/** Acme as Paperclip serves it: the task list leaves the chats out, as it does without `q=`. */
function serveAcmeWithoutChatsInTasks(): void {
  const data = acmeData();
  data.tasks = data.tasks.filter((task) => task.id !== chatTask);
  paperclip.serveAcme(data).on("GET", chatCardsPath, {
    body: [
      {
        id: chatCard,
        kind: "request_confirmation",
        status: "pending",
        createdByAgentId: agentAda,
        payload: { version: 1, prompt: "Ship the draft?" },
        createdAt: "2026-11-24T10:04:00.000Z",
      },
    ],
  });
}

beforeEach(() => {
  network.offline = false;
  paperclip = new FakePaperclip();
  serveAcmeWithoutChatsInTasks();
});

const chatCardReads = () =>
  paperclip.seen.filter((request) => request.path === chatCardsPath).length;

verifies("inbox.every-waiting-item", () => {
  it("lists the card an agent asked on its own chat, which the task list leaves out", async () => {
    const client = connect(paperclip, network);
    await client.refresh();

    const items = await client.listInboxItems();

    expect(items.map((item) => item.id)).toContain(cardId(chatTask, chatCard));
  });

  it("reads a chat's cards again only when the chat changed", async () => {
    const client = connect(paperclip, network);
    await client.listInboxItems();
    await client.listInboxItems();
    expect(chatCardReads()).toBe(1);

    const data = acmeData();
    const touched = data.chats.map((chat) => ({ ...chat, updatedAt: "2026-11-24T10:06:00.000Z" }));
    paperclip.on("GET", `/api/companies/${company}/chats`, { body: touched });
    await client.listInboxItems();
    expect(chatCardReads()).toBe(2);
  });
});
