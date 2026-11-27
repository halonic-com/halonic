import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import {
  ancestorIds,
  maxAncestorDepth,
  parentBlockers,
  parentBlockKey,
  parentBlockMessage,
} from "./parent-block.ts";
import type { BlockedRow, BlockerRow, UnblockPaperclip } from "./unblock.ts";
import { unblockPass } from "./unblock.ts";

function blocker(identifier: string, status: string): BlockerRow {
  return { id: `id-${identifier}`, identifier, status };
}

/** HAL-18142 under HAL-17956 under HAL-17000, as the 25 Nov case had it. */
const parents: Record<string, string> = {
  "id-HAL-18142": "id-HAL-17956",
  "id-HAL-17956": "id-HAL-17000",
};
const parentOf = async (taskId: string) => parents[taskId] ?? null;

/** One blocked task held by an agent, with its blockers; releases land in a list. */
function fakePaperclip(blockers: BlockerRow[], result: "todo" | "blocked" | "closed" = "todo") {
  const task: BlockedRow = {
    id: "id-HAL-18142",
    identifier: "HAL-18142",
    assigneeAgentId: "agent-owen",
    running: false,
    blockedSince: null,
  };
  const released: { taskId: string; removed: readonly BlockerRow[] }[] = [];
  const unblocked: string[] = [];
  const paperclip: UnblockPaperclip = {
    blockedTasks: async () => [task],
    blockers: async () => blockers,
    unblock: async (taskId) => {
      unblocked.push(taskId);
      return "written";
    },
    lastUnblock: async () => null,
    parentOf,
    releaseParentBlock: async (taskId, removed) => {
      released.push({ taskId, removed });
      return result;
    },
  };
  return { paperclip, released, unblocked };
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

verifies("paperclip.pr-watcher-parent-block", () => {
  test("finds every task above a task, nearest first", async () => {
    expect([...(await ancestorIds("id-HAL-18142", parentOf))]).toEqual([
      "id-HAL-17956",
      "id-HAL-17000",
    ]);
    expect([...(await ancestorIds("id-HAL-17000", parentOf))]).toEqual([]);
  });

  test("stops at a parent loop and at the depth limit", async () => {
    const loop: Record<string, string> = { a: "b", b: "c", c: "a" };
    expect([...(await ancestorIds("a", async (id) => loop[id] ?? null))]).toEqual(["b", "c"]);
    const endless = async (id: string) => `${id}+`;
    expect((await ancestorIds("x", endless)).size).toBe(maxAncestorDepth);
  });

  test("counts only unfinished blockers above the task", () => {
    const above = new Set(["id-HAL-17956", "id-HAL-17000"]);
    const blockers = [
      blocker("HAL-17956", "in_progress"),
      blocker("HAL-17000", "done"),
      blocker("HAL-18143", "in_progress"),
    ];
    expect(parentBlockers(blockers, above)).toEqual([blocker("HAL-17956", "in_progress")]);
  });

  test("says why the link went and what happens next", () => {
    const removed = [blocker("HAL-17956", "in_progress")];
    expect(parentBlockMessage(removed, true)).toBe(
      "PR watcher: this task was blocked by HAL-17956, which is above it in the task tree. A parent can't finish before its child, so that was a deadlock (`parent_block`) and the link is removed. Nothing else unfinished blocks it, so it's back to `todo`.",
    );
    expect(parentBlockMessage(removed, false)).toContain("so it stays blocked.");
    expect(parentBlockKey([blocker("HAL-2", "todo"), blocker("HAL-1", "todo")])).toBe(
      "parent-block id-HAL-1,id-HAL-2",
    );
  });

  // HAL-18142 sat blocked by its parent HAL-17956 (25 Nov).
  test("releases a task blocked by its parent", async () => {
    const fake = fakePaperclip([blocker("HAL-17956", "in_progress")]);
    const { summary, lines } = await sweep(fake);
    expect(summary).toEqual({ unblocked: 0, parentBlocks: 1, failed: [] });
    expect(fake.released).toEqual([
      { taskId: "id-HAL-18142", removed: [blocker("HAL-17956", "in_progress")] },
    ]);
    expect(lines[0]).toBe("HAL-18142: parent_block, blocked by HAL-17956 above it");
  });

  test("removes only the grandparent when another task still blocks it", async () => {
    const fake = fakePaperclip(
      [blocker("HAL-17000", "todo"), blocker("HAL-18143", "in_progress")],
      "blocked",
    );
    expect((await sweep(fake)).summary.parentBlocks).toBe(1);
    expect(fake.released[0]?.removed).toEqual([blocker("HAL-17000", "todo")]);
  });

  test("treats a finished parent as any finished blocker", async () => {
    const fake = fakePaperclip([blocker("HAL-17956", "done")]);
    expect((await sweep(fake)).summary).toEqual({ unblocked: 1, parentBlocks: 0, failed: [] });
    expect(fake.released).toEqual([]);
  });

  test("leaves a task blocked by a sibling alone", async () => {
    const fake = fakePaperclip([blocker("HAL-18143", "in_progress")]);
    expect((await sweep(fake)).summary).toEqual({ unblocked: 0, parentBlocks: 0, failed: [] });
    expect(fake.released).toEqual([]);
  });

  test("only logs in a dry run", async () => {
    const fake = fakePaperclip([blocker("HAL-17956", "in_progress")]);
    const { summary, lines } = await sweep(fake, true);
    expect(summary.parentBlocks).toBe(1);
    expect(fake.released).toEqual([]);
    expect(lines[0]).toBe("HAL-18142: parent_block, blocked by HAL-17956 above it (dry run)");
  });

  test("counts nothing when the task moved before the write", async () => {
    const fake = fakePaperclip([blocker("HAL-17956", "in_progress")], "closed");
    const { summary, lines } = await sweep(fake);
    expect(summary.parentBlocks).toBe(0);
    expect(lines.at(-1)).toBe(
      "HAL-18142: no longer blocked by HAL-17956 during this pass, so left alone",
    );
  });
});
