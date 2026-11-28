import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { planCard, suggestedTasksCard, yesNoCard } from "./card-fixtures.ts";
import { readCard, seedCard } from "./card-seed.ts";
import type { Call } from "./paperclip-api.ts";

const folders: string[] = [];

afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true })));
});

/** A fresh cards file, as the seed leaves it, in a folder removed after the test. */
async function emptyCardsFile(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "click-test-cards-"));
  folders.push(folder);
  const file = join(folder, "cards.json");
  await writeFile(file, "[]");
  return file;
}

/**
 * A fake Paperclip board API that records each call. The agent's copy shows on the chat after
 * `agentAfter` reads of it; never, when undefined.
 */
function fakeCall(agentAfter: number | undefined) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  let chatReads = 0;
  const call: Call = async (method, path, body) => {
    calls.push({ method, path, body });
    if (path === "/api/issues/chat-1/interactions") {
      chatReads += 1;
      const posted = agentAfter !== undefined && chatReads > agentAfter;
      return posted ? [{ id: "m1", idempotencyKey: `click-test-${planCard.key}-messenger` }] : [];
    }
    if (path.endsWith("/documents/plan")) return { latestRevisionId: `rev-${path.split("/")[3]}` };
    return { id: path.endsWith("/issues") ? "t1" : "i1" };
  };
  return { call, calls };
}

verifies("studio-click-test.card-steps", () => {
  describe("seedCard", () => {
    it("posts the Inbox copy as the board and asks the agent for the Messenger copy", async () => {
      const cardsFile = await emptyCardsFile();
      const { call, calls } = fakeCall(1);
      const setup = { companyId: "co1", agentId: "agent-1", chatId: "chat-1", cardsFile };
      // What the agent reads while the seed waits for its copy.
      let asking = "";
      const seeded = await seedCard(call, setup, planCard, async () => {
        asking = await readFile(cardsFile, "utf8");
      });
      expect(seeded).toEqual({
        Inbox: { issueId: "t1", id: "i1" },
        Messenger: { issueId: "chat-1", id: "m1" },
      });
      // Each copy is bound to its own task's plan, so the chat gets a plan of its own.
      const inboxCard = calls.find((each) => each.path === "/api/issues/t1/interactions");
      expect(inboxCard?.body).toMatchObject({
        kind: "request_confirmation",
        idempotencyKey: "click-test-plan-inbox",
        payload: {
          prompt: "Approve the Acme launch plan? (Inbox)",
          rejectRequiresReason: true,
          target: { type: "issue_document", key: "plan", revisionId: "rev-t1" },
        },
      });
      const asked = JSON.parse(asking);
      expect(asked).toEqual([
        {
          path: "/api/issues/chat-1/interactions",
          body: expect.objectContaining({
            payload: expect.objectContaining({
              prompt: "Approve the Acme launch plan? (Messenger)",
              target: { type: "issue_document", key: "plan", revisionId: "rev-chat-1" },
            }),
          }),
        },
      ]);
      // Once the copy came, the agent is asked for nothing more.
      await expect(readFile(cardsFile, "utf8")).resolves.toBe("[]");
      // One message wakes the agent; the file is written before it.
      const messages = calls.filter((each) => each.path === "/api/issues/chat-1/comments");
      expect(messages).toHaveLength(1);
      expect(messages[0]?.body).toMatchObject({ clientRequestId: expect.any(String) });
    });

    it("wakes the agent again, then throws when it never posts its copy", async () => {
      const { call, calls } = fakeCall(undefined);
      const setup = {
        companyId: "co1",
        agentId: "agent-1",
        chatId: "chat-1",
        cardsFile: await emptyCardsFile(),
      };
      await expect(seedCard(call, setup, yesNoCard, async () => undefined)).rejects.toThrow(
        "the agent never posted the yes-no card on its chat",
      );
      const messages = calls.filter((each) => each.path === "/api/issues/chat-1/comments");
      expect(messages).toHaveLength(3);
    });
  });

  describe("readCard", () => {
    it("reads a copy's status and result from its task's cards", async () => {
      const call: Call = async () => [
        { id: "other", status: "pending" },
        { id: "i1", status: "rejected", result: { reason: "needs a date" } },
      ];
      await expect(readCard(call, { issueId: "t1", id: "i1" })).resolves.toEqual({
        status: "rejected",
        result: { reason: "needs a date" },
      });
      await expect(readCard(call, { issueId: "t1", id: "gone" })).rejects.toThrow(
        "Paperclip has no card gone",
      );
    });
  });
});

verifies("studio-click-test.list-card-steps", () => {
  it("puts a suggested-task card's prompt in its title, since its payload has none", async () => {
    const { call, calls } = fakeCall(undefined);
    const setup = {
      companyId: "co1",
      agentId: "agent-1",
      chatId: "chat-1",
      cardsFile: await emptyCardsFile(),
    };
    await expect(seedCard(call, setup, suggestedTasksCard, async () => undefined)).rejects.toThrow(
      "never posted",
    );
    const inbox = calls.find((each) => each.path === "/api/issues/t1/interactions");
    expect(inbox?.body).toMatchObject({
      kind: "suggest_tasks",
      title: "Follow-ups for the Acme launch (Inbox)",
      payload: { version: 1, tasks: [{ clientKey: "press" }, { clientKey: "survey" }] },
    });
  });
});
