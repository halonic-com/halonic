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
import { ReadRefused } from "../merge-control/read-client.ts";
import type { ObservedAction } from "../merge-control/shadow.ts";
import type { MergeSnapshot } from "../merge-control/snapshot.ts";
import {
  type MergeControlApi,
  mergeControlPass,
  readMergeControlSettings,
  rulesOf,
} from "./merge-control-job.ts";
import { mergeControlNamespace, passLock } from "./merge-control-lock.ts";

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
  const state = {
    get: async (key: { stateKey: string }) => stored.get(key.stateKey) ?? null,
    set: async (key: { stateKey: string }, value: unknown) => {
      stored.set(key.stateKey, value);
    },
  };
  const ctx = {
    config: { get: async () => config },
    secrets: { resolve },
    http: { fetch },
    issues: { createComment },
    logger: { info: (line: string) => lines.push(line), error: (line: string) => lines.push(line) },
  } as unknown as MergeControlApi;
  const lock = passLock(state as never);
  return { ctx, lock, stored, fetch, resolve, createComment, lines };
}

const token = { type: "secret_ref", secretId: "secret-1" };

verifies("paperclip.merge-control-shadow", () => {
  test("shadow mode over a busy pass sends no write and never resolves the queue token", async () => {
    const fake = fakeContext({ mergeControl: { mode: "shadow" }, mergeQueueToken: token });
    await mergeControlPass(fake.ctx, fake.lock, companyId, now, async () => ({
      snapshot: busyPass(),
      observed: [],
    }));
    expect(fake.lines.filter((line) => line.endsWith(": shadow")).length).toBeGreaterThanOrEqual(3);
    expect(fake.fetch).not.toHaveBeenCalled();
    expect(fake.resolve).not.toHaveBeenCalled();
  });

  test("the daily diff lists a differing action with its cost, once the day is over", async () => {
    const fake = fakeContext({
      mergeControl: { mode: "shadow", diffTask: "task-17700", mergerLogin: "acme-queue" },
      mergeQueueToken: token,
    });
    const queued = Array.from({ length: 9 }, (_, index) => pull(10 + index));
    const fast = pull(30, {
      labels: ["built-on:paperclip", "fast-track"],
      fastTrackBy: "acme-queue",
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
    await mergeControlPass(fake.ctx, fake.lock, companyId, now, async () => ({
      snapshot: facts,
      observed,
    }));
    expect(fake.createComment).not.toHaveBeenCalled();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60_000);
    await mergeControlPass(fake.ctx, fake.lock, companyId, tomorrow, async () => ({
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
    await mergeControlPass(fake.ctx, fake.lock, companyId, now, read);
    expect(read).not.toHaveBeenCalled();
    expect(readMergeControlSettings({ mergeControl: { mode: "ACT" } }).mode).toBe("off");
  });
});

verifies("paperclip.merge-control-write-scope", () => {
  test("act mode sends the pass's writes, resolving the token at each one", async () => {
    const fake = fakeContext({ mergeControl: { mode: "act" }, mergeQueueToken: token });
    await mergeControlPass(fake.ctx, fake.lock, companyId, now, async () => ({
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
    await mergeControlPass(fake.ctx, fake.lock, companyId, now, async () => ({
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
      await mergeControlPass(fake.ctx, fake.lock, companyId, at, async () => ({
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

verifies("paperclip.merge-control-pass-lock", () => {
  test("a pass writes its state through the pass lock, and the plain state client is refused", async () => {
    const fake = fakeContext({ mergeControl: { mode: "shadow" } });
    let release: () => void = () => {};
    const held = fake.lock.run(
      companyId,
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const read = vi.fn(async () => ({ snapshot: busyPass(), observed: [] }));
    const pass = mergeControlPass(fake.ctx, fake.lock, companyId, now, read);
    await new Promise((resolve) => setTimeout(resolve, 10));
    // The lock is held elsewhere: the pass hasn't loaded, read or written yet.
    expect(read).not.toHaveBeenCalled();
    expect(fake.stored.has("pass")).toBe(false);
    release();
    await held;
    await pass;
    expect(fake.stored.get("pass")).toMatchObject({ version: 1 });
    const key = {
      scopeKind: "company",
      scopeId: companyId,
      namespace: mergeControlNamespace,
      stateKey: "pass",
    } as const;
    await expect(fake.lock.state.set(key, { version: 1 })).rejects.toThrow(
      "Merge control: its state is written only under the pass lock.",
    );
  });
});

verifies("paperclip.merge-control-api-budget", () => {
  const minutesLater = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

  test("a pass that leaves the read budget low degrades, waits, then reads lean, without throwing", async () => {
    const fake = fakeContext({ mergeControl: { mode: "shadow" } });
    const read = vi.fn(async () => ({
      snapshot: busyPass(),
      observed: [],
      reads: { calls: 10, remaining: 500, resetAt: "2026-11-24T12:41:00Z" },
    }));
    const first = await mergeControlPass(fake.ctx, fake.lock, companyId, now, read);
    expect(first?.degraded).toBe(true);
    expect(first?.summary).toContain("reads 10 this pass, 500 of 12000/h left, resets 12:41 UTC");
    expect(fake.lines).toContain(`Merge control: ${first?.summary}`);

    const waiting = await mergeControlPass(fake.ctx, fake.lock, companyId, minutesLater(1), read);
    expect(waiting).toEqual({
      degraded: true,
      summary: "GitHub budget: degraded, this pass waits until 12:05 UTC",
    });
    expect(read).toHaveBeenCalledTimes(1);

    await mergeControlPass(fake.ctx, fake.lock, companyId, minutesLater(6), read);
    expect(read).toHaveBeenLastCalledWith(companyId, minutesLater(6), { lean: true });
  });

  test("a read the reader refuses gives a degraded pass, not a thrown one", async () => {
    const fake = fakeContext({ mergeControl: { mode: "shadow" } });
    const refused = new ReadRefused("GitHub refused the read token again after it was read anew.");
    refused.calls = { calls: 2, remaining: null, resetAt: null };
    const result = await mergeControlPass(fake.ctx, fake.lock, companyId, now, async () => {
      throw refused;
    });
    expect(result?.degraded).toBe(true);
    expect(result?.summary).toContain("reads 2 this pass");
    expect(result?.summary).toContain("degraded (GitHub refused the read token again");
  });

  test("act mode counts its writes apart from the reads, and the write token reads nothing", async () => {
    const fake = fakeContext({ mergeControl: { mode: "act" }, mergeQueueToken: token });
    const result = await mergeControlPass(fake.ctx, fake.lock, companyId, now, async () => ({
      snapshot: busyPass(),
      observed: [],
      reads: { calls: 7, remaining: null, resetAt: null },
    }));
    const writes = fake.fetch.mock.calls.length;
    expect(writes).toBeGreaterThanOrEqual(3);
    expect(result?.summary).toContain("reads 7 this pass");
    expect(result?.summary).toContain(`writes ${writes} this pass`);
    expect(result?.summary).not.toContain("ghs_queue_token_for_tests");
    for (const [, init] of fake.fetch.mock.calls as unknown as [string, { method: string }][]) {
      expect(init.method).toBe("POST");
    }
  });
});

verifies("paperclip.merge-control-fast-track", () => {
  test("only the board's queue login fast-tracks, never the account every agent posts as", () => {
    expect(rulesOf({ mergeControl: { mergerLogin: "acme-queue" } }).fastTrackLabellers).toEqual([
      "acme-queue",
    ]);
    expect(rulesOf({}).fastTrackLabellers).toEqual([]);
  });
});
