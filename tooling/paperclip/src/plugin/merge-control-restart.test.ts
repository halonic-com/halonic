import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { ago, headOf, now, pull, snapshot } from "../merge-control/merge-control.test-helper.ts";
import type { GroupRun, MergeSnapshot } from "../merge-control/snapshot.ts";
import { type MergeControlApi, mergeControlPass } from "./merge-control-job.ts";
import { passLock } from "./merge-control-lock.ts";

const companyId = "company-1";

/** Plugin state as Paperclip's database keeps it: JSON, across worker restarts. */
function database() {
  const rows = new Map<string, string>();
  return {
    get: async (key: { stateKey: string }) => {
      const row = rows.get(key.stateKey);
      return row === undefined ? null : JSON.parse(row);
    },
    set: async (key: { stateKey: string }, value: unknown) => {
      rows.set(key.stateKey, JSON.stringify(value));
    },
  };
}

/** A fresh worker: its own pass lock and nothing in memory, over the same database. */
function worker(db: ReturnType<typeof database>) {
  const ctx = {
    config: { get: async () => ({ mergeControl: { mode: "shadow" } }) },
    secrets: { resolve: async () => "" },
    http: { fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }) },
    issues: { createComment: async () => ({}) },
    logger: { info: () => undefined, error: () => undefined },
  } as unknown as MergeControlApi;
  return { ctx, lock: passLock(db as never) };
}

const failed: GroupRun = {
  id: 7005,
  conclusion: "failure",
  branch: `gh-readonly-queue/main/pr-5-${headOf(5)}`,
  url: "https://github.com/acme/tools/actions/runs/7005",
  createdAt: ago(20),
  failedJobs: [{ id: 1, name: "Leak guard", url: "u", failedSteps: ["Scan"] }],
};

async function enqueuesAt(
  db: ReturnType<typeof database>,
  at: Date,
  facts: MergeSnapshot,
): Promise<boolean> {
  const { ctx, lock } = worker(db);
  await mergeControlPass(ctx, lock, companyId, at, async () => ({ snapshot: facts, observed: [] }));
  const stored = await db.get({ stateKey: "pass" });
  return Object.keys(stored.shadow.decided).includes("enqueue #5");
}

verifies("paperclip.merge-control-unjudged-hold", () => {
  test("a culprit hold survives a restart: a fresh worker over the stored state keeps the head out", async () => {
    const db = database();
    expect(await enqueuesAt(db, now, snapshot({ pulls: [pull(5)], groupRuns: [failed] }))).toBe(
      false,
    );
    const stored = await db.get({ stateKey: "pass" });
    expect(stored.state.failedHeads).toEqual({ "5": headOf(5) });

    // Two hours later, after a restart: the group is out of the culprit window and the caches are gone.
    const later = new Date(now.getTime() + 2 * 60 * 60_000);
    expect(await enqueuesAt(db, later, snapshot({ pulls: [pull(5)] }))).toBe(false);
    expect((await db.get({ stateKey: "pass" })).state.failedHeads).toEqual({ "5": headOf(5) });
  });
});
