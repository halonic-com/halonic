import { verifies } from "@halonicjs/testing-spec";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import { describe, expect, test } from "vitest";
import { manifest } from "../plugin/manifest.ts";
import type { ImportComment } from "../verdicts/import.ts";
import { entityVerdicts } from "../verdicts/store.ts";
import { ago, pull as gatePull, headOf, now, said, snapshot } from "./merge-control.test-helper.ts";
import { emptyShadowDay, shadowDiff, shadowDiffText } from "./shadow.ts";
import {
  checkVerdicts,
  type VerdictChecks,
  type VerdictShadowReader,
  verdictDiffLines,
} from "./shadow-verdicts.ts";

const repo = "halonic-com/halonic";
const settings = { repo, teamLogin: "halonic-dev" };
const agents = [
  { id: "agent-mateo", urlKey: "mateo" },
  { id: "agent-liam", urlKey: "liam" },
  { id: "agent-julian", urlKey: "julian" },
];

function comment(
  id: string,
  authorAgentId: string,
  body: string,
  extra: Partial<ImportComment> = {},
) {
  return {
    id,
    authorAgentId,
    origin: "comment",
    body,
    createdByRunId: `run-${id}`,
    createdAt: ago(20),
    updatedAt: ago(20),
    deleted: false,
    ...extra,
  };
}

/** A pull request every agent's account opened, as ours are. */
function pull(number: number, changes: Parameters<typeof gatePull>[1] = {}) {
  return gatePull(number, { author: "halonic-dev", ...changes });
}

/** Mateo's hand-over of #3 on HAL-3, the task its branch names. */
const handOver = comment("c-hand", "agent-mateo", "Ready for review: halonic#3.");
/** Liam's copy of his approval of #3's head on HAL-3 (0.1). */
const copy = comment("c-copy", "agent-liam", `Liam: approved on head \`${headOf(3)}\``);

/** A reader over the test host's entities and the given comments on HAL-3. */
function fakeReader(comments: readonly ImportComment[], failing = false) {
  const harness = createTestHarness({ manifest, config: {} });
  const store = entityVerdicts(harness.ctx.entities, "acme");
  const reader: VerdictShadowReader = {
    reviewerIds: { liam: "agent-liam", julian: "agent-julian" },
    records: async (pr) => {
      if (failing) throw new Error("Paperclip is down.");
      return store.list(repo, pr);
    },
    append: (draft) => store.append(draft),
    taskComments: async (identifier) => (identifier === "HAL-3" ? comments : []),
    agents: async () => agents,
  };
  return { reader, store };
}

/** #3 with Liam's approval line on GitHub, as the default pull request has. */
const approvedOnGitHub = snapshot({ pulls: [pull(3)] });

async function checkOnce(comments: readonly ImportComment[], facts = approvedOnGitHub) {
  const { reader, store } = fakeReader(comments);
  const checks = await checkVerdicts(facts, undefined, reader, settings, now);
  return { checks, store, reader };
}

verifies("paperclip.verdicts-shadow", () => {
  describe("the 0.1 import", () => {
    test("imports Liam's copy from his own run, and then the two sides agree", async () => {
      const { checks, store } = await checkOnce([handOver, copy]);
      expect(checks["3"]).toMatchObject({
        head: headOf(3),
        gate: true,
        recorded: "approved",
        recordedWhy: "Liam",
        imported: 1,
      });
      expect(await store.list(repo, 3)).toEqual([
        expect.objectContaining({
          head: headOf(3),
          verdict: "approved",
          reviewer: "liam",
          agentId: "agent-liam",
          runId: "run-c-copy",
          task: "HAL-3",
          importedFrom: "c-copy",
        }),
      ]);
      expect(verdictDiffLines(checks)).toEqual([]);
    });

    test.each([
      ["edited", { updatedAt: ago(5) }],
      ["deleted", { deleted: true }],
      ["a receipt", { origin: "fast_response" }],
      ["not from a run", { createdByRunId: null }],
      ["by another agent", { authorAgentId: "agent-mateo" }],
      ["naming 7 characters", { body: `Liam: approved on head \`${headOf(3).slice(0, 7)}\`` }],
      ["naming an older head", { body: `Liam: approved on head \`${headOf(3, 1)}\`` }],
    ])("doesn't import a copy %s, and lists the difference", async (_, change) => {
      const { checks, store } = await checkOnce([handOver, { ...copy, ...change }]);
      expect(await store.list(repo, 3)).toEqual([]);
      expect(verdictDiffLines(checks)).toEqual([
        {
          key: `#3 on ${headOf(3).slice(0, 9)}`,
          at: now.toISOString(),
          reason: "gate: approved; records: not approved, no recorded approval",
        },
      ]);
    });

    test("imports nothing when the branch's agent never named the pull request on the task", async () => {
      const { store } = await checkOnce([copy]);
      expect(await store.list(repo, 3)).toEqual([]);
    });

    test("imports nothing on Liam's own pull request", async () => {
      const own = snapshot({ pulls: [pull(3, { branch: "liam/HAL-3-thing" })] });
      const liamHandOver = comment("c-hand", "agent-liam", "Ready: halonic#3.");
      const { store } = await checkOnce([liamHandOver, copy], own);
      expect(await store.list(repo, 3)).toEqual([]);
    });

    test("imports each copy once", async () => {
      const { reader, store } = fakeReader([handOver, copy]);
      const first = await checkVerdicts(approvedOnGitHub, undefined, reader, settings, now);
      const later = new Date(now.getTime() + 20 * 60_000);
      const second = await checkVerdicts(approvedOnGitHub, first, reader, settings, later);
      expect(await store.list(repo, 3)).toHaveLength(1);
      expect(second["3"]?.imported).toBe(1);
    });

    test("doesn't import a copy older than the reviewer's newer change request", async () => {
      const { reader, store } = fakeReader([handOver, copy]);
      // Stored with the store's own time, after the copy was written.
      await reader.append({
        repo,
        pr: 3,
        head: headOf(3),
        fingerprint: null,
        verdict: "changes-requested",
        reviewer: "liam",
        agentId: "agent-liam",
        runId: "run-2",
        task: "HAL-3",
      });
      const checks = await checkVerdicts(approvedOnGitHub, undefined, reader, settings, now);
      expect(await store.list(repo, 3)).toHaveLength(1);
      expect(checks["3"]).toMatchObject({
        recorded: "not approved",
        recordedWhy: "changes requested by Liam",
      });
      expect(checks["3"]?.imported).toBeUndefined();
    });

    test("doesn't import a copy whose origin isn't a comment", async () => {
      const { store } = await checkOnce([handOver, { ...copy, origin: "system_note" }]);
      expect(await store.list(repo, 3)).toEqual([]);
    });
  });

  describe("the comparison", () => {
    test("lists a recorded approval the gate doesn't see", async () => {
      const { reader } = fakeReader([]);
      await reader.append({
        repo,
        pr: 3,
        head: headOf(3),
        fingerprint: null,
        verdict: "approved",
        reviewer: "liam",
        agentId: "agent-liam",
        runId: "run-1",
        task: "HAL-3",
      });
      const facts = snapshot({ pulls: [pull(3, { texts: [] })] });
      const checks = await checkVerdicts(facts, undefined, reader, settings, now);
      const [line] = verdictDiffLines(checks);
      expect(line?.reason).toMatch(/^gate: not approved, .+; records: approved, Liam$/);
    });

    test("a change request on GitHub holds the gate's side", async () => {
      const held = snapshot({
        pulls: [
          pull(3, {
            texts: [
              said(`Liam: approved on head \`${headOf(3).slice(0, 7)}\``, 30),
              said("Liam: changes requested, see the note.", 10),
            ],
          }),
        ],
      });
      const { checks } = await checkOnce([handOver, copy], held);
      expect(checks["3"]).toMatchObject({ gate: false, gateWhy: "changes requested by Liam" });
    });

    test("records that can't be read are unknown, and listed", async () => {
      const { reader } = fakeReader([handOver, copy], true);
      const checks = await checkVerdicts(approvedOnGitHub, undefined, reader, settings, now);
      expect(verdictDiffLines(checks)[0]?.reason).toBe(
        "gate: approved; records: unknown, the records couldn't be read: Paperclip is down.",
      );
    });

    test("checks a head again after 15 minutes or on a new head, not sooner", async () => {
      const before: VerdictChecks = {
        "3": {
          head: headOf(3),
          since: ago(10),
          checkedAt: ago(10),
          gate: true,
          recorded: "approved",
        },
      };
      const { reader } = fakeReader([]);
      expect(await checkVerdicts(approvedOnGitHub, before, reader, settings, now)).toEqual(before);
      const pushed = snapshot({ pulls: [pull(3, { head: headOf(3, 1) })] });
      const after = await checkVerdicts(pushed, before, reader, settings, now);
      expect(after["3"]).toMatchObject({ head: headOf(3, 1), since: now.toISOString() });
    });

    test("the daily diff lists the differences and the imports", async () => {
      const { checks } = await checkOnce([handOver, { ...copy, updatedAt: ago(5) }]);
      const day = { ...emptyShadowDay(now), verdicts: checks };
      const text = shadowDiffText(shadowDiff(day));
      expect(text).toContain(
        "**Recorded verdicts disagree with the gate: shadow only, nothing refused** (1)",
      );
      const imported = await checkOnce([handOver, copy]);
      const importedText = shadowDiffText(
        shadowDiff({ ...emptyShadowDay(now), verdicts: imported.checks }),
      );
      expect(importedText).toContain("Imported 1 approvals from their Paperclip copies.");
    });
  });
});
