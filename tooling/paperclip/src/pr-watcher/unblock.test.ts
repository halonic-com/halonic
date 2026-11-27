import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { type BlockedRow, type BlockerRow, type UnblockPaperclip, unblockPass } from "./unblock.ts";

/** A blocked task held by an agent, with no run. */
function blocked(identifier: string, extra: Partial<BlockedRow> = {}): BlockedRow {
  return {
    id: `id-${identifier}`,
    identifier,
    assigneeAgentId: "agent-owen",
    running: false,
    blockedSince: null,
    ...extra,
  };
}

function blocker(identifier: string, status: string, finishedAt?: string): BlockerRow {
  return { id: `id-${identifier}`, identifier, status, ...(finishedAt ? { finishedAt } : {}) };
}

/**
 * A Paperclip with blocked tasks in memory; unblocks land in its list, and the
 * tasks stay blocked, as when an agent sets them to blocked again.
 */
function fakePaperclip(
  tasks: readonly BlockedRow[],
  blockers: Record<string, BlockerRow[]>,
  movedMeanwhile: ReadonlySet<string> = new Set(),
) {
  const unblocked: { taskId: string; body: string; key: string }[] = [];
  const lastUnblocks = new Map<string, string>();
  const paperclip: UnblockPaperclip = {
    blockedTasks: async () => [...tasks],
    blockers: async (taskId) => blockers[taskId] ?? [],
    unblock: async (taskId, body, key) => {
      if (movedMeanwhile.has(taskId)) {
        return "closed";
      }
      unblocked.push({ taskId, body, key });
      lastUnblocks.set(taskId, key);
      return "written";
    },
    lastUnblock: async (taskId) => lastUnblocks.get(taskId) ?? null,
    parentOf: async () => null,
    releaseParentBlock: async () => "closed",
  };
  return { paperclip, unblocked };
}

async function sweep(fake: ReturnType<typeof fakePaperclip>, dryRun = false) {
  const lines: string[] = [];
  const summary = await unblockPass({
    paperclip: fake.paperclip,
    dryRun,
    log: (line) => lines.push(line),
  });
  return { summary, lines };
}

verifies("paperclip.pr-watcher-unblock", () => {
  // HAL-17446 sat blocked for 4 hours behind HAL-17445 (24 Nov).
  test("moves a task to todo, naming its blockers, once every blocker is done", async () => {
    const fake = fakePaperclip([blocked("HAL-17446")], {
      "id-HAL-17446": [blocker("HAL-17445", "done")],
    });
    expect((await sweep(fake)).summary).toEqual({ unblocked: 1, parentBlocks: 0, failed: [] });
    expect(fake.unblocked).toEqual([
      {
        taskId: "id-HAL-17446",
        body: "PR watcher: everything this task was blocked by is finished (HAL-17445 done), so it's back to `todo`.",
        key: "unblock id-HAL-17445",
      },
    ]);
  });

  test("counts a cancelled blocker as finished", async () => {
    const fake = fakePaperclip([blocked("HAL-2")], {
      "id-HAL-2": [blocker("HAL-3", "cancelled"), blocker("HAL-1", "done")],
    });
    expect((await sweep(fake)).summary.unblocked).toBe(1);
    // Sorted, so the same blockers give the same key, whatever order Paperclip lists them in.
    expect(fake.unblocked[0]?.key).toBe("unblock id-HAL-1,id-HAL-3");
  });

  test("leaves a task blocked while one blocker isn't finished", async () => {
    const fake = fakePaperclip([blocked("HAL-2")], {
      "id-HAL-2": [blocker("HAL-1", "done"), blocker("HAL-3", "in_progress")],
    });
    expect((await sweep(fake)).summary.unblocked).toBe(0);
    expect(fake.unblocked).toEqual([]);
  });

  test("leaves alone a task with nothing in blocked by, a person's task and a running one", async () => {
    const done = [blocker("HAL-1", "done")];
    const fake = fakePaperclip(
      [
        blocked("HAL-2"),
        blocked("HAL-3", { assigneeAgentId: null }),
        blocked("HAL-4", { running: true }),
      ],
      { "id-HAL-3": done, "id-HAL-4": done },
    );
    expect((await sweep(fake)).summary.unblocked).toBe(0);
    expect(fake.unblocked).toEqual([]);
  });

  test("leaves alone a task that moved during the pass", async () => {
    const fake = fakePaperclip(
      [blocked("HAL-2")],
      { "id-HAL-2": [blocker("HAL-1", "done")] },
      new Set(["id-HAL-2"]),
    );
    const { summary, lines } = await sweep(fake);
    expect(summary.unblocked).toBe(0);
    expect(lines.at(-1)).toBe("HAL-2: no longer blocked during this pass, so left alone");
  });

  test("only logs in a dry run", async () => {
    const fake = fakePaperclip([blocked("HAL-2")], { "id-HAL-2": [blocker("HAL-1", "done")] });
    const { summary, lines } = await sweep(fake, true);
    expect(summary.unblocked).toBe(1);
    expect(fake.unblocked).toEqual([]);
    expect(lines[0]).toContain("HAL-2: unblock (dry run)");
  });

  test("reports a task it couldn't read and goes on with the others", async () => {
    const fake = fakePaperclip([blocked("HAL-2"), blocked("HAL-5")], {
      "id-HAL-5": [blocker("HAL-1", "done")],
    });
    fake.paperclip.blockers = async (taskId) => {
      if (taskId === "id-HAL-2") {
        throw new Error("relations unavailable");
      }
      return [blocker("HAL-1", "done")];
    };
    const { summary, lines } = await sweep(fake);
    expect(summary).toEqual({ unblocked: 1, parentBlocks: 0, failed: ["HAL-2"] });
    expect(lines[0]).toBe("HAL-2: couldn't unblock it: relations unavailable");
  });

  // HAL-20169: HAL-19131 and others were set to blocked again and again, each time put back to todo.
  test("leaves blocked a task set to blocked after every blocker had finished", async () => {
    const fake = fakePaperclip(
      [blocked("HAL-19131", { blockedSince: "2026-11-27T06:48:29.095Z" })],
      {
        "id-HAL-19131": [
          blocker("HAL-1", "done", "2026-11-26T10:00:00.000Z"),
          blocker("HAL-3", "cancelled", "2026-11-27T06:00:00.000Z"),
        ],
      },
    );
    const { summary, lines } = await sweep(fake);
    expect(summary.unblocked).toBe(0);
    expect(fake.unblocked).toEqual([]);
    expect(lines).toEqual([
      "HAL-19131: every blocker finished before it was set to blocked, so left blocked",
    ]);
  });

  test("unblocks once a blocker finishes after the task was set to blocked", async () => {
    const fake = fakePaperclip([blocked("HAL-2", { blockedSince: "2026-11-27T06:00:00.000Z" })], {
      "id-HAL-2": [
        blocker("HAL-1", "done", "2026-11-26T10:00:00.000Z"),
        blocker("HAL-3", "done", "2026-11-27T07:00:00.000Z"),
      ],
    });
    expect((await sweep(fake)).summary.unblocked).toBe(1);
    // The key carries when the last blocker finished, so Paperclip wakes again for a later finish.
    expect(fake.unblocked[0]?.key).toBe(
      "unblock id-HAL-1,id-HAL-3 finished 2026-11-27T07:00:00.000Z",
    );
  });

  test("never unblocks a task twice for the same blockers", async () => {
    const fake = fakePaperclip([blocked("HAL-2", { blockedSince: "2026-11-27T06:00:00.000Z" })], {
      "id-HAL-2": [blocker("HAL-1", "done", "2026-11-27T07:00:00.000Z")],
    });
    expect((await sweep(fake)).summary.unblocked).toBe(1);
    const second = await sweep(fake);
    expect(second.summary.unblocked).toBe(0);
    expect(second.lines).toEqual([
      "HAL-2: already unblocked once for these blockers, so left blocked",
    ]);
    expect(fake.unblocked).toHaveLength(1);
  });

  test("unblocks only once when Paperclip gives no times", async () => {
    const fake = fakePaperclip([blocked("HAL-2")], { "id-HAL-2": [blocker("HAL-1", "done")] });
    expect((await sweep(fake)).summary.unblocked).toBe(1);
    expect((await sweep(fake)).summary.unblocked).toBe(0);
    expect(fake.unblocked.map((unblock) => unblock.key)).toEqual(["unblock id-HAL-1"]);
  });

  test("unblocks again when a reopened blocker finishes again", async () => {
    const blockers = { "id-HAL-2": [blocker("HAL-1", "done", "2026-11-27T07:00:00.000Z")] };
    const first = fakePaperclip(
      [blocked("HAL-2", { blockedSince: "2026-11-27T06:00:00.000Z" })],
      blockers,
    );
    await sweep(first);
    // HAL-1 was reopened, the task set to blocked on it again, and HAL-1 finished again.
    first.paperclip.blockedTasks = async () => [
      blocked("HAL-2", { blockedSince: "2026-11-27T08:00:00.000Z" }),
    ];
    blockers["id-HAL-2"] = [blocker("HAL-1", "done", "2026-11-27T09:00:00.000Z")];
    expect((await sweep(first)).summary.unblocked).toBe(1);
    expect(first.unblocked.map((unblock) => unblock.key)).toEqual([
      "unblock id-HAL-1 finished 2026-11-27T07:00:00.000Z",
      "unblock id-HAL-1 finished 2026-11-27T09:00:00.000Z",
    ]);
  });
});
