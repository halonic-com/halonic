// The engine's `rule` step on the real QuickJS isolate (HAL-18500): core
// can't import an adapter, even in its tests, so the end-to-end runs live here.

import {
  fixedIds,
  ManualClock,
  MemoryBlobStore,
  MemoryRunStore,
  MemoryScheduler,
  MemorySecrets,
} from "@halonicjs/adapter-memory";
import { LocalExecutor, type RunDefinitions } from "@halonicjs/engine";
import { allToolsReviewed } from "@halonicjs/engine/testing";
import type { ScheduledTimer } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { createQuickJsToolScriptIsolate } from "./index.ts";

/** What the executor and the store give back, without importing the events package. */
type RunSummary = Awaited<ReturnType<LocalExecutor["start"]>>;
type RunEvent = Awaited<ReturnType<MemoryRunStore["events"]>>[number];

const rulePath = "rules/match.rule.js";

/** Picks every pull request after the first: keeps P5, so the same input gives the same output. */
const pickRule = "export function run(ctx) { return { merge: ctx.input.prs.slice(1) }; }";

/** The rule step `match`, then a final step whose signal reads the rule's pick. */
const watch: RunDefinitions["workflow"] = {
  version: 1,
  id: "watch",
  name: "Watch",
  initial: "match",
  context: {},
  layout: {},
  states: {
    match: {
      type: "rule",
      rule: rulePath,
      input: { prs: "{{input.prs}}" },
      output: "decisions",
      on: [{ to: "done", event: "done" }],
    },
    done: {
      type: "final",
      signal: { name: "prs.picked", data: { merge: "{{context.decisions.merge}}" } },
      on: [],
    },
  },
};

/** An engine on memory ports and the QuickJS isolate, whose every model call fails. */
function engineWithRule(code: string) {
  const clock = new ManualClock();
  let deliver: (timer: ScheduledTimer) => Promise<void> = async () => {};
  const scheduler = new MemoryScheduler(
    { onTimer: (timer) => deliver(timer), onTick: async () => {} },
    clock,
  );
  const store = new MemoryRunStore();
  const executor = new LocalExecutor({
    resolveModel: async () => {
      throw new Error("No model is configured.");
    },
    halonicTools: [],
    connectors: [],
    listedToolApproval: allToolsReviewed,
    secrets: new MemorySecrets(),
    clock,
    runs: {
      store,
      blobs: new MemoryBlobStore(),
      scheduler,
      ids: fixedIds(),
      toolScriptIsolate: createQuickJsToolScriptIsolate(),
      definitionsOf: async () => ({ workflow: watch, rules: { [rulePath]: code } }),
    },
  });
  deliver = (timer) => executor.onTimer(timer);
  return { executor, scheduler, store };
}

/** Starts a run and delivers its timers until it has ended. */
async function runToEnd(code: string, prs: readonly number[]) {
  const { executor, scheduler, store } = engineWithRule(code);
  let summary: RunSummary = await executor.start({
    hubId: "acme",
    workflowId: "watch",
    input: { prs },
  });
  for (let round = 0; round < 10 && summary.status === "running"; round += 1) {
    await scheduler.runDue();
    summary = (await store.get(summary.id)) ?? summary;
  }
  return { summary, log: await store.events(summary.id) };
}

const lastEvent = (log: readonly RunEvent[]) => log.at(-1);

verifies("toolscript-quickjs.rule-step", () => {
  it("runs the rule with no model, and the next step reads its output", async () => {
    const { summary, log } = await runToEnd(pickRule, [5, 7, 9]);

    expect(summary.status).toBe("completed");
    expect(log.filter((event) => event.type.startsWith("llm."))).toEqual([]);
    expect(log).toContainEqual(
      expect.objectContaining({ type: "signal.sent", data: { merge: [7, 9] } }),
    );
  });

  it.each([
    ["fetch", 'export async function run() { return await fetch("https://example.com"); }'],
    ["process", "export function run() { return process.env; }"],
    ["require", 'export function run() { return require("node:fs").readFileSync("/etc/hosts"); }'],
  ])("fails the run with a clear error for a rule that reads %s", async (name, code) => {
    const { summary, log } = await runToEnd(code, [1]);

    expect(summary.status).toBe("failed");
    const failed = lastEvent(log);
    expect(failed).toMatchObject({ type: "run.failed", state: "match" });
    const error = failed?.type === "run.failed" ? failed.error : "";
    expect(error).toMatch(/^Rule step "match" failed with toolscript\.script-error/);
    expect(error).toContain(name);
  });

  it("fails the run with a file import, before the rule runs", async () => {
    const code =
      'import { readFileSync } from "node:fs";\nexport function run() { return readFileSync("/etc/hosts"); }';
    const { summary, log } = await runToEnd(code, [1]);

    expect(summary.status).toBe("failed");
    expect(lastEvent(log)).toMatchObject({
      type: "run.failed",
      error: expect.stringMatching(/^Rule step "match" failed with toolscript\./),
    });
  });

  it("stops a rule that never ends at the CPU limit", async () => {
    const { summary, log } = await runToEnd("export function run() { for (;;) {} }", [1]);

    expect(summary.status).toBe("failed");
    expect(lastEvent(log)).toMatchObject({
      type: "run.failed",
      error: expect.stringMatching(/^Rule step "match" failed with limit\.cpu/),
    });
  }, 30_000);

  it("gives the same output for the same input on every run", async () => {
    const first = await runToEnd(pickRule, [3, 4]);
    const second = await runToEnd(pickRule, [3, 4]);

    expect(first.summary.context["decisions"]).toEqual({ merge: [4] });
    expect(second.summary.context["decisions"]).toEqual(first.summary.context["decisions"]);
  });
});
