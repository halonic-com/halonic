import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { decisionCard, hireCard } from "./card-fixtures.ts";
import type { Call } from "./paperclip-api.ts";
import { readRecord, seedApproval, seedDecision } from "./record-seed.ts";

const folders: string[] = [];

afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true })));
});

/** The seed's setup, with a fresh cards file in a folder removed after the test. */
async function setup() {
  const folder = await mkdtemp(join(tmpdir(), "click-test-records-"));
  folders.push(folder);
  const cardsFile = join(folder, "cards.json");
  await writeFile(cardsFile, "[]");
  return { companyId: "co1", agentId: "agent-1", chatId: "chat-1", cardsFile };
}

verifies("studio-click-test.approval-card-steps", () => {
  describe("seedApproval", () => {
    it("posts both copies as the board, the Messenger's in the agent's name", async () => {
      const bodies: unknown[] = [];
      const call: Call = async (_method, path, body) => {
        expect(path).toBe("/api/companies/co1/approvals");
        bodies.push(body);
        return { id: `a${bodies.length}` };
      };
      await expect(seedApproval(call, await setup(), hireCard)).resolves.toEqual({
        Inbox: { record: "approval", id: "a1" },
        Messenger: { record: "approval", id: "a2" },
      });
      expect(bodies).toEqual([
        {
          type: "hire_agent",
          payload: expect.objectContaining({ title: `${hireCard.prompt} (Inbox)` }),
        },
        {
          type: "hire_agent",
          payload: expect.objectContaining({ title: `${hireCard.prompt} (Messenger)` }),
          requestedByAgentId: "agent-1",
        },
      ]);
    });
  });

  describe("seedDecision", () => {
    it("has the agent post both copies in its run and finds each by its title", async () => {
      const seeded = await setup();
      const call: Call = async (method, path) => {
        if (method === "POST") return {};
        expect(path).toBe("/api/companies/co1/decisions?status=open&originAgentId=agent-1");
        return [
          { id: "d2", title: `${decisionCard.prompt} (Messenger)` },
          { id: "d1", title: `${decisionCard.prompt} (Inbox)` },
        ];
      };
      const result = await seedDecision(call, seeded, decisionCard, async () => undefined);
      expect(result).toEqual({
        Inbox: { record: "decision", id: "d1" },
        Messenger: { record: "decision", id: "d2" },
      });
      // Once both came, the agent is asked for nothing more.
      await expect(readFile(seeded.cardsFile, "utf8")).resolves.toBe("[]");
    });

    it("asks the agent for both decisions, with options that change nothing", async () => {
      const seeded = await setup();
      let asked: unknown;
      let reads = 0;
      const call: Call = async (method) => {
        if (method === "POST") return {};
        reads += 1;
        asked ??= JSON.parse(await readFile(seeded.cardsFile, "utf8"));
        return reads < 2 ? [] : [{ id: "d1", title: "x" }];
      };
      await expect(seedDecision(call, seeded, decisionCard, async () => undefined)).rejects.toThrow(
        "the agent never posted the decision card on its chat",
      );
      expect(asked).toEqual([
        {
          path: "/api/companies/co1/decisions",
          body: expect.objectContaining({
            title: `${decisionCard.prompt} (Inbox)`,
            options: [
              { id: "blue", label: "Blue", effects: [] },
              { id: "green", label: "Green", effects: [] },
            ],
            idempotencyKey: "click-test-decision-inbox",
          }),
        },
        expect.objectContaining({
          body: expect.objectContaining({ title: `${decisionCard.prompt} (Messenger)` }),
        }),
      ]);
    });
  });

  describe("readRecord", () => {
    it("reads an approval's status and note, and an open decision as pending", async () => {
      const call: Call = async (_method, path) =>
        path.startsWith("/api/approvals/")
          ? { status: "revision_requested", decisionNote: "aim lower" }
          : { status: "open", chosenOptionId: null };
      await expect(readRecord(call, { record: "approval", id: "a1" })).resolves.toEqual({
        status: "revision_requested",
        result: { decisionNote: "aim lower" },
      });
      await expect(readRecord(call, { record: "decision", id: "d1" })).resolves.toEqual({
        status: "pending",
        result: { chosenOptionId: null },
      });
    });
  });
});
