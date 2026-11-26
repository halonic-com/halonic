import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { maxInputBytes, ruleInputs } from "./pr-watcher-input.ts";
import { impureUses, impurities, valueImports } from "./purity.test-helper.ts";
import { decide, type WatchedTask } from "./rules/pr-watcher.ts";

const now = "2026-11-25T04:00:00Z";

const rules = join(import.meta.dirname, "rules");

/** A busy task: two open pull requests with a review each, and a full memory. */
function busyTask(number: number): WatchedTask {
  const pull = (pr: number) => ({
    pr: `halonic-com/halonic#${pr}`,
    state: "open" as const,
    head: "0123456789abcdef0123456789abcdef01234567",
    ciOkOnHead: "failure" as const,
    draft: false,
    conflicting: true,
    inQueue: false,
    retargeted: false,
    latestReview: { id: "i7152096461", at: "2026-11-25T03:37:54Z" },
    githubApproved: false,
    held: false,
    landed: false,
    mergedAt: null,
  });
  return {
    task: `HAL-${number}`,
    holder: "b41bf995-f18c-49a3-a5f9-b30b3004e3ba",
    owner: "b41bf995-f18c-49a3-a5f9-b30b3004e3ba",
    running: false,
    openChildren: false,
    parked: false,
    memory: {
      reported: [`halonic-com/halonic#${number} 0123456 ci-red`],
      seenUntil: "2026-11-25T03:00:00Z",
      heldAt: null,
      lastCommentAt: "2026-11-25T03:00:00Z",
    },
    pulls: [pull(number), pull(number + 1)],
  };
}

verifies("paperclip.signal-pr-watcher", () => {
  test("each rule imports only types, reads no clock, network, file or randomness, and stays under 300 lines", () => {
    for (const file of readdirSync(rules)) {
      const source = readFileSync(join(rules, file), "utf8");
      expect(valueImports(file, source), file).toEqual([]);
      expect(impureUses(file, source), file).toEqual([]);
      expect(source.split("\n").length, file).toBeLessThanOrEqual(300);
    }
  });

  test("the purity check finds what a text search misses", () => {
    const impure = [
      'import { readFileSync } from "node:fs";',
      'export { decide } from "./other.ts";',
      'const loaded = import("node:fs");',
      "const today = Date();",
      "const later = new Date(0);",
      "const clock = Date.now;",
      "const run = eval;",
      'const make = new Function("return 1");',
      "const dice = Math.random();",
      "const { env } = process;",
      'const reach = globalThis["fe" + "tch"];',
      "const at = import.meta.url;",
      'const dice = Math["ran" + "dom"]();',
      "const M = Math;",
      "const { random } = Math;",
      'const make = (() => 0).constructor("return 1");',
      'const proto = row["__proto__"];',
    ];
    expect(impurities("bad.ts", impure.join("\n")).map((line) => line.split(" ")[0])).toEqual([
      "1:1",
      "2:1",
      "3:16",
      "4:15",
      "5:19",
      "6:15",
      "7:13",
      "8:18",
      "9:14",
      "10:17",
      "11:15",
      "12:12",
      "13:14",
      "14:11",
      "15:20",
      "16:14",
      "17:15",
    ]);
    const pure = [
      'import type { Memory } from "./types.ts";',
      'import { type Pull } from "./types.ts";',
      "const at: Date | null = null;",
      'const parsed = Date.parse("2026-11-25T00:00:00Z");',
      "const top = Math.max(1, 2);",
      "const row = { process: 1, fetch: 2 };",
      "export const read = row.process + row.fetch;",
    ];
    expect(impurities("good.ts", pure.join("\n"))).toEqual([]);
  });

  test("cuts the input of 60 busy tasks into batches under the 16 KB ToolScript inputBytes default", () => {
    const tasks = Array.from({ length: 60 }, (_, index) => busyTask(5000 + index * 2));
    const settings = { done: true, wakeOn: ["ci-red" as const] };
    const one = new TextEncoder().encode(JSON.stringify({ now, settings, tasks: [tasks[0]] }));
    expect(one.byteLength).toBeLessThan(1100);
    const { inputs, tooLarge } = ruleInputs(now, settings, tasks);
    expect(tooLarge).toEqual([]);
    expect(inputs.length).toBeLessThanOrEqual(5);
    expect(inputs.flatMap((input) => input.tasks)).toEqual(tasks);
    for (const input of inputs) {
      expect(new TextEncoder().encode(JSON.stringify(input)).byteLength).toBeLessThanOrEqual(
        maxInputBytes,
      );
    }
    expect(inputs.flatMap(decide).map((action) => action.key)).toContain(
      "halonic-com/halonic#5119 0123456 ci-red",
    );
  });

  test("leaves out a task too large for an input of its own, and names it", () => {
    const huge = {
      ...busyTask(9),
      memory: {
        ...busyTask(9).memory,
        reported: Array.from(
          { length: 400 },
          (_, index) => `halonic-com/halonic#9 0123456 review ${index}`,
        ),
      },
    };
    const { inputs, tooLarge } = ruleInputs(now, { done: true, wakeOn: [] }, [busyTask(7), huge]);
    expect(tooLarge).toEqual(["HAL-9"]);
    expect(inputs.flatMap((input) => input.tasks.map((task) => task.task))).toEqual(["HAL-7"]);
  });

  test("leaves out the states the signal doesn't wake on, and marks nothing done with done off", () => {
    const task = busyTask(7);
    const input = {
      now: "2026-11-25T04:00:00Z",
      settings: { done: true, wakeOn: ["conflict" as const] },
      tasks: [task],
    };
    expect(decide(input).map((action) => action.key)).toEqual([
      "halonic-com/halonic#7 0123456 conflict",
      "halonic-com/halonic#8 0123456 conflict",
    ]);
    const merged = {
      ...task,
      pulls: task.pulls.map((pull) => ({
        ...pull,
        state: "merged" as const,
        landed: true,
        mergedAt: "2026-11-25T02:00:00Z",
      })),
    };
    const off = {
      ...input,
      settings: { done: false, wakeOn: [] },
      tasks: [{ ...merged, memory: { ...merged.memory, lastCommentAt: null } }],
    };
    expect(decide(off)).toEqual([]);
    expect(decide({ ...off, settings: { done: true, wakeOn: [] } })).toEqual([
      expect.objectContaining({
        kind: "task-update",
        task: "HAL-7",
        pulls: ["halonic-com/halonic#7", "halonic-com/halonic#8"],
      }),
    ]);
  });
});
