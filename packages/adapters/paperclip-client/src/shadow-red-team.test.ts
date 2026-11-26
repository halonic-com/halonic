import { readFileSync } from "node:fs";
import { shadowDigest } from "@halonicjs/auto-approvals";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { company } from "./acme-data.test-helper.ts";
import { paperclipRequests } from "./requests.ts";
import type { ShadowRequestName } from "./shadow-fetch.ts";
import {
  digestDay,
  expectCard,
  expectShadowGetsOnly,
  shadowRun,
} from "./shadow-red-team.test-helper.ts";
import { cardRows } from "./shadow-red-team-cards.test-helper.ts";
import { documentRows } from "./shadow-red-team-documents.test-helper.ts";
import { runnerRows } from "./shadow-red-team-runner.test-helper.ts";
import { b0, cardReasons, everyFake, runnerFor, runReasons } from "./shadow-world.test-helper.ts";

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
      // An allowlist: the reader imports nothing else, so none of the files that send approve,
      // reject or a document write (cards.ts, card-kinds.ts, board-request-items.ts and others).
      const reader = importsOf(readFileSync(new URL("shadow-reads.ts", import.meta.url), "utf8"));
      expect(new Set(reader)).toEqual(
        new Set([
          "@halonicjs/auto-approvals",
          "./avatars.ts",
          "./json.ts",
          "./requests.ts",
          "./shadow-fetch.ts",
          "./transport.ts",
        ]),
      );
    });

    // The fault goes inside the real reader: for this test only, a shadow row is pointed at a
    // write, so the reader's own guard is what refuses it.
    const faults: [string, ShadowRequestName, { method: "POST" | "PUT"; path: string }][] = [
      ["approve", "getApproval", paperclipRequests.approve],
      ["reject", "getApproval", paperclipRequests.rejectApproval],
      [
        "a document write",
        "readStopDocument",
        { ...paperclipRequests.readStopDocument, method: "PUT" },
      ],
    ];
    for (const [what, row, write] of faults) {
      it(`G2.4: ${what} from inside the reader is refused unsent, and the run halts`, async () => {
        const world = b0();
        const { fake, reader, runner, store } = runnerFor(world);
        await runner.start();
        const rows: Record<string, { method: string; path: string }> = paperclipRequests;
        const original = rows[row];
        rows[row] = write;
        try {
          expect(await runner.poll()).toMatchObject({ stopped: "guard.refused" });
        } finally {
          if (original !== undefined) rows[row] = original;
        }
        expect(fake.seen.every((request) => request.method === "GET")).toBe(true);
        expect(reader.counts()).toMatchObject({ refused: 1, refusedNotGet: 1, writesSent: 0 });
        expect(runner.halted()).toBe("guard.refused");
        expect(runReasons(store)).toEqual(["run.started", "guard.refused"]);
        const digest = shadowDigest({
          day: digestDay,
          entries: store.stored,
          calls: reader.counts(),
          build: "abc1234",
          until: new Date(),
        });
        expect(digest).toContain("writes sent: 0, refused: 1 (1 of them writes)");
      });
    }

    it("G4: every digest gives the call counts and both documents' revisions", async () => {
      const run = await shadowRun(b0());
      expect(run.digest).toMatch(
        /^Calls to Paperclip: \d+ sent .* writes sent: 0, refused: 0 \(0 of them writes\)/m,
      );
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

  // A35's recorder: after every test, whatever order they ran in (the preset shuffles them),
  // every request of the suite was a GET on the shadow list with the pinned ids.
  afterAll(() => {
    // Every row, G2.4, the one-request and 429 checks and A43 to A45 made at least one fake.
    expect(everyFake.length).toBeGreaterThan(rows.length);
    for (const fake of everyFake) expectShadowGetsOnly(fake);
  });
});

function importsOf(source: string): string[] {
  return [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1] ?? "");
}
