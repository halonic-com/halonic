import { verifies } from "@halonicjs/testing-spec";
import { expect, test, vi } from "vitest";
import {
  ago,
  check,
  entry,
  greenChecks,
  now,
  pull,
  snapshot,
} from "../merge-control/merge-control.test-helper.ts";
import type { ObservedAction } from "../merge-control/shadow.ts";
import type { MergeSnapshot } from "../merge-control/snapshot.ts";
import {
  type MergeControlApi,
  mergeControlPass,
  readMergeControlSettings,
} from "./merge-control-job.ts";

const companyId = "company-1";

/**
 * A pass with something to do of each kind the write client sends: #3 to
 * fill, #2 queued with a conflict to take out, a cancelled `ci-ok` to rerun.
 */
function busyPass(): MergeSnapshot {
  return snapshot({
    pulls: [
      pull(2, { mergeable: "CONFLICTING" }),
      pull(3),
      pull(4, {
        checks: [...greenChecks().slice(1), check("ci-ok", "CI", { conclusion: "cancelled" })],
      }),
    ],
    queue: [entry(2, 1)],
  });
}

function fakeContext(config: Record<string, unknown>, failing: RegExp = /^$/) {
  const stored = new Map<string, unknown>();
  const fetch = vi.fn(async (url: string) => {
    const status = failing.test(url) ? 502 : 200;
    return { ok: status === 200, status, json: async () => ({ data: {} }) };
  });
  const resolve = vi.fn(async () => "ghs_queue_token_for_tests");
  const createComment = vi.fn(async () => ({}));
  const lines: string[] = [];
  const ctx = {
    config: { get: async () => config },
    secrets: { resolve },
    http: { fetch },
    issues: { createComment },
    logger: { info: (line: string) => lines.push(line), error: (line: string) => lines.push(line) },
    state: {
      get: async (key: { stateKey: string }) => stored.get(key.stateKey) ?? null,
      set: async (key: { stateKey: string }, value: unknown) => {
        stored.set(key.stateKey, value);
      },
    },
  } as unknown as MergeControlApi;
  return { ctx, fetch, resolve, createComment, lines };
}

const token = { type: "secret_ref", secretId: "secret-1" };

verifies("paperclip.merge-control-shadow", () => {
  test("shadow mode over a busy pass sends no write and never resolves the queue token", async () => {
    const fake = fakeContext({ mergeControl: { mode: "shadow" }, mergeQueueToken: token });
    await mergeControlPass(fake.ctx, companyId, now, async () => ({
      snapshot: busyPass(),
      observed: [],
    }));
    expect(fake.lines.filter((line) => line.endsWith(": shadow")).length).toBeGreaterThanOrEqual(3);
    expect(fake.fetch).not.toHaveBeenCalled();
    expect(fake.resolve).not.toHaveBeenCalled();
  });

  test("the daily diff lists a differing action with its cost, once the day is over", async () => {
    const fake = fakeContext({
      mergeControl: { mode: "shadow", diffTask: "task-17700" },
      mergeQueueToken: token,
    });
    const queued = Array.from({ length: 9 }, (_, index) => pull(10 + index));
    const fast = pull(30, {
      labels: ["built-on:paperclip", "fast-track"],
      fastTrackBy: "halonic-dev",
    });
    const facts = snapshot({
      pulls: [...queued, fast],
      queue: queued.map((each, index) => entry(each.number, index + 1)),
    });
    // The Merger queued #30 without a jump.
    const observed: ObservedAction[] = [
      { kind: "enqueue", number: 30, jump: false, at: ago(1) },
      { kind: "cancel-run", runId: 777, at: ago(2) },
    ];
    await mergeControlPass(fake.ctx, companyId, now, async () => ({ snapshot: facts, observed }));
    expect(fake.createComment).not.toHaveBeenCalled();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60_000);
    await mergeControlPass(fake.ctx, companyId, tomorrow, async () => ({
      snapshot: snapshot(),
      observed: [],
    }));
    expect(fake.createComment).toHaveBeenCalledTimes(1);
    const [task, text] = fake.createComment.mock.calls[0] as unknown as [string, string];
    expect(task).toBe("task-17700");
    expect(text).toContain("Merge control shadow diff for 2026-11-24 (UTC): 1 passes");
    expect(text).toContain(
      "- 12:00 enqueue #30 (merge control: jump, Merger: no jump) (cancels 9 groups, 2160 runner-minutes)",
    );
    expect(text).toContain("**Only the Merger did** (1)\n- 11:58 cancel-run run 777");
    expect(fake.fetch).not.toHaveBeenCalled();
  });

  test("off, the default, reads no facts and keeps nothing", async () => {
    const fake = fakeContext({ mergeQueueToken: token });
    const read = vi.fn();
    await mergeControlPass(fake.ctx, companyId, now, read);
    expect(read).not.toHaveBeenCalled();
    expect(readMergeControlSettings({ mergeControl: { mode: "ACT" } }).mode).toBe("off");
  });
});

verifies("paperclip.merge-control-write-scope", () => {
  test("act mode sends the pass's writes, resolving the token at each one", async () => {
    const fake = fakeContext({ mergeControl: { mode: "act" }, mergeQueueToken: token });
    await mergeControlPass(fake.ctx, companyId, now, async () => ({
      snapshot: busyPass(),
      observed: [],
    }));
    const sent = fake.fetch.mock.calls.length;
    expect(sent).toBeGreaterThanOrEqual(3);
    expect(fake.resolve).toHaveBeenCalledTimes(sent);
    expect(fake.lines.join("\n")).not.toContain("ghs_queue_token_for_tests");
  });

  test("act mode without a queue token writes nothing and says so", async () => {
    const fake = fakeContext({ mergeControl: { mode: "act" } });
    await mergeControlPass(fake.ctx, companyId, now, async () => ({
      snapshot: busyPass(),
      observed: [],
    }));
    expect(fake.fetch).not.toHaveBeenCalled();
    expect(fake.lines).toContain(
      "Merge control: act mode without a queue token, nothing is written.",
    );
  });
});

verifies("paperclip.merge-control-failed-writes", () => {
  const reruns = (fake: ReturnType<typeof fakeContext>) =>
    fake.fetch.mock.calls.filter(([url]) => url.endsWith("/rerun")).length;
  const twoPasses = async (fake: ReturnType<typeof fakeContext>) => {
    for (const at of [now, new Date(now.getTime() + 60_000)]) {
      await mergeControlPass(fake.ctx, companyId, at, async () => ({
        snapshot: busyPass(),
        observed: [],
      }));
    }
  };

  test("a rerun whose write failed is sent again on the next pass", async () => {
    const fake = fakeContext({ mergeControl: { mode: "act" }, mergeQueueToken: token }, /\/rerun$/);
    await twoPasses(fake);
    expect(reruns(fake)).toBe(2);
    expect(fake.lines.some((line) => line.includes("rerun run") && line.includes("failed"))).toBe(
      true,
    );
  });

  test("a rerun that went out isn't sent again on the next pass", async () => {
    const fake = fakeContext({ mergeControl: { mode: "act" }, mergeQueueToken: token });
    await twoPasses(fake);
    expect(reruns(fake)).toBe(1);
  });
});
