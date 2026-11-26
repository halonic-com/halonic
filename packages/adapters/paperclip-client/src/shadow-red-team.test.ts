import { readFileSync } from "node:fs";
import { shadowDigest } from "@halonicjs/auto-approvals";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { company } from "./acme-data.test-helper.ts";
import { ShadowCallCounter } from "./shadow-fetch.ts";
import { digestDay, expectCard, shadowRun } from "./shadow-red-team.test-helper.ts";
import { cardRows } from "./shadow-red-team-cards.test-helper.ts";
import { documentRows } from "./shadow-red-team-documents.test-helper.ts";
import { runnerRows } from "./shadow-red-team-runner.test-helper.ts";
import {
  b0,
  cardReasons,
  first,
  MemoryLedgerStore,
  runnerFor,
  runReasons,
} from "./shadow-world.test-helper.ts";

// S5 of the auto approvals shadow build (HAL-19462 PR 4): every Part A row of Julian's red-team
// list (HAL-19463) end to end, and his HAL-19507 checks G2 to G4.

const rows = [...cardRows, ...documentRows, ...runnerRows];

verifies("paperclip-client.shadow-red-team", () => {
  describe("the shadow red-team cases (HAL-19463, part A)", () => {
    it("B0, the control, ends in card.untyped because v1 has no live kinds, and nothing else", async () => {
      const run = await expectCard(() => undefined, "card.untyped");
      expect(run.digest).toContain("- requester mismatch: 0 of 1");
    });

    it("has one case for each of the 46 rows", () => {
      expect(rows.map((row) => row.id)).toEqual(Array.from({ length: 46 }, (_, i) => `A${i + 1}`));
    });

    for (const row of rows) {
      // A row asserts with node:assert inside its helpers; a failed assertion rejects here.
      it(`${row.id}: ${row.change}`, () => expect(row.check()).resolves.not.toThrow(), 60_000);
    }
  });

  describe("Julian's checks (HAL-19507)", () => {
    it("G2.2: the runner and its port import nothing that can write to Paperclip", () => {
      const core = new URL("../../../core/auto-approvals/src/", import.meta.url);
      for (const file of ["shadow-runner.ts", "shadow-source.ts", "shadow-digest.ts"]) {
        const imports = importsOf(readFileSync(new URL(file, core), "utf8"));
        expect(
          imports.filter((from) => !from.startsWith("./") && from !== "@halonicjs/std"),
        ).toEqual([]);
      }
      const reader = importsOf(readFileSync(new URL("shadow-reads.ts", import.meta.url), "utf8"));
      for (const writer of ["./client.ts", "./writer.ts", "./inbox.ts", "./decisions.ts"]) {
        expect(reader).not.toContain(writer);
      }
    });

    it("G2.4: a fault that tries a write is refused unsent, and the run halts", async () => {
      const world = b0();
      const store = new MemoryLedgerStore();
      const faulty = new ShadowCallCounter();
      const { fake, runner } = runnerFor(world, store, (reader, paperclip) => ({
        pendingApprovals: async () => {
          const id = String(first(world).record["id"]);
          const approve = new URL(`/api/approvals/${id}/approve`, paperclip.address);
          await expect(
            faulty.guardFetch(paperclip.fetch)(approve, { method: "POST" }),
          ).rejects.toThrow();
          return reader.pendingApprovals();
        },
        approval: (id) => reader.approval(id),
        pinnedDocuments: (issue) => reader.pinnedDocuments(issue),
        serverTime: () => reader.serverTime(),
        counts: () => ({ ...reader.counts(), ...faulty.counts(), sent: reader.counts().sent }),
      }));
      await runner.start();
      expect(await runner.poll()).toMatchObject({ stopped: "guard.refused" });
      expect(fake.seen.some((request) => request.method !== "GET")).toBe(false);
      expect(runner.halted()).toBe("guard.refused");
      expect(runReasons(store)).toEqual(["run.started", "guard.refused"]);
      const digest = shadowDigest({
        day: digestDay,
        entries: store.stored,
        calls: faulty.counts(),
        build: "abc1234",
        until: new Date(),
      });
      expect(digest).toContain("refused: 1 (1 of them writes)");
    });

    it("G4: every digest gives the call counts and both documents' revisions", async () => {
      const run = await shadowRun(b0());
      expect(run.digest).toMatch(/^Calls to Paperclip: \d+ sent .* writes sent: 0, refused: 0/m);
      expect(run.digest).toContain("never-list revisions today:");
      expect(run.digest).toContain("stop document revisions today:");
    });

    it("sends one request at a time", async () => {
      const world = b0();
      const { fake, runner } = runnerFor(world);
      let open = 0;
      let most = 0;
      const handle = fake.handle.bind(fake);
      fake.handle = async (request) => {
        open += 1;
        most = Math.max(most, open);
        await Promise.resolve();
        const response = await handle(request);
        open -= 1;
        return response;
      };
      await runner.start();
      await runner.poll();
      expect(most).toBe(1);
    });

    it("backs off after 429, up to an hour, and goes back to 5 minutes after a good poll", async () => {
      const world = b0();
      const tooMany = () => Response.json({}, { status: 429 });
      world.overrides.set(`GET /api/companies/${company}/approvals`, tooMany);
      const { runner, store } = runnerFor(world);
      await runner.start();
      const delays: number[] = [];
      for (let poll = 0; poll < 6; poll += 1) {
        await runner.poll();
        delays.push(runner.nextDelayMs() / 60_000);
      }
      expect(delays).toEqual([10, 20, 40, 60, 60, 60]);
      world.overrides.clear();
      await runner.poll();
      expect(runner.nextDelayMs()).toBe(5 * 60_000);
      expect(cardReasons(store)).toEqual(["card.untyped"]);
    });
  });
});

function importsOf(source: string): string[] {
  return [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1] ?? "");
}
