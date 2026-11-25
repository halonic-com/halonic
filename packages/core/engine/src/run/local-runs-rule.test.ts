import type { Workflow, WorkflowState } from "@halonicjs/format";
import {
  type ToolScriptIsolate,
  type ToolScriptIsolateRequest,
  type ToolScriptIsolateResult,
  toolScriptDefaultLimits,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns } from "../kernel/kernel-test-kit.test-helper.ts";
import { type RunsSetup, runsOn } from "./local-runs-test-kit.test-helper.ts";

const rulePath = "rules/match.rule.js";
const ruleCode = "export function run(ctx) { return { merge: ctx.input.prs.slice(1) }; }";

/** A rule step that picks the pull requests to merge, then a final step whose signal reads them. */
function watchWorkflow(match: Partial<WorkflowState> = {}): Workflow {
  return {
    version: 1,
    id: "watch",
    name: "Watch",
    initial: "match",
    context: { prs: [5, 7] },
    layout: {},
    states: {
      match: {
        type: "rule",
        rule: rulePath,
        input: { prs: "{{context.prs}}" },
        output: "decisions",
        on: [{ to: "done", event: "done" }],
        ...match,
      },
      done: {
        type: "final",
        signal: { name: "prs.picked", data: { merge: "{{context.decisions.merge}}" } },
        on: [],
      },
    },
  };
}

/** An isolate that keeps every request and answers each with `result`. */
class FakeIsolate implements ToolScriptIsolate {
  readonly limits = toolScriptDefaultLimits.user;
  readonly requests: ToolScriptIsolateRequest[] = [];
  readonly #result: ToolScriptIsolateResult;

  constructor(result: ToolScriptIsolateResult) {
    this.#result = result;
  }

  async run(request: ToolScriptIsolateRequest): Promise<ToolScriptIsolateResult> {
    this.requests.push(request);
    return this.#result;
  }
}

const trace = { log: [], limits: toolScriptDefaultLimits.agent };

/** The watch workflow's runs, on an engine whose every model call fails. */
function watchRuns(setup: RunsSetup) {
  return runsOn([], new KernelRuns(), {
    workflow: watchWorkflow(),
    rules: { [rulePath]: ruleCode },
    onResolveModel: () => {
      throw new Error("No model is configured.");
    },
    ...setup,
  });
}

const watchStart = { hubId: "acme", workflowId: "watch", input: {} };

verifies("engine.rule-state", () => {
  it("runs the rule with no model, and the next step reads its output", async () => {
    const isolate = new FakeIsolate({ ok: true, output: { merge: [7] }, ...trace });
    const { executor, runs, scheduler } = watchRuns({ toolScriptIsolate: isolate });

    await executor.start(watchStart);
    await scheduler.runDue();

    const [request] = isolate.requests;
    expect(request).toMatchObject({ code: ruleCode, input: { prs: [5, 7] }, functions: {} });
    expect(request?.limits).toEqual(toolScriptDefaultLimits.agent);
    const log = runs.logs.get("run_1") ?? [];
    expect(log.filter((event) => event.type.startsWith("llm."))).toEqual([]);
    expect(log).toContainEqual(
      expect.objectContaining({ type: "context.updated", key: "decisions", value: { merge: [7] } }),
    );
    expect(log).toContainEqual(
      expect.objectContaining({ type: "signal.sent", data: { merge: [7] } }),
    );
    expect(log.at(-1)).toMatchObject({ type: "run.completed", state: "done" });
  });

  it("runs the rule once for a timer delivered twice", async () => {
    const isolate = new FakeIsolate({ ok: true, output: { merge: [] }, ...trace });
    const { executor, runs, scheduler } = watchRuns({ toolScriptIsolate: isolate });

    await executor.start(watchStart);
    await scheduler.runDue(2);

    expect(isolate.requests).toHaveLength(1);
    expect(runs.logs.get("run_1")?.at(-1)).toMatchObject({ type: "run.completed" });
  });

  it("fails the run with the reason the isolate stopped the rule for", async () => {
    const stopped = { ok: false as const, reason: "limit.cpu" as const, message: "2 s of CPU" };
    const { executor, runs, scheduler } = watchRuns({
      toolScriptIsolate: new FakeIsolate({ ...stopped, ...trace }),
    });

    await executor.start(watchStart);
    await scheduler.runDue();

    expect(runs.logs.get("run_1")?.at(-1)).toMatchObject({
      type: "run.failed",
      state: "match",
      error: 'Rule step "match" failed with limit.cpu: 2 s of CPU',
    });
  });

  it("fails the run when its definitions hold no code for the rule", async () => {
    const isolate = new FakeIsolate({ ok: true, output: null, ...trace });
    const { executor, runs, scheduler } = watchRuns({ toolScriptIsolate: isolate, rules: {} });

    await executor.start(watchStart);
    await scheduler.runDue();

    expect(isolate.requests).toEqual([]);
    expect(runs.logs.get("run_1")?.at(-1)).toMatchObject({
      type: "run.failed",
      error: expect.stringContaining(
        'failed with rule.missing: The rule file "rules/match.rule.js"',
      ),
    });
  });

  it("fails a rule step with no output as it is entered", async () => {
    const isolate = new FakeIsolate({ ok: true, output: null, ...trace });
    const { executor, scheduler } = watchRuns({
      toolScriptIsolate: isolate,
      workflow: watchWorkflow({ output: undefined }),
    });

    const failed = await executor.start(watchStart);
    await scheduler.runDue();

    expect(isolate.requests).toEqual([]);
    expect(failed).toMatchObject({ status: "failed", state: "match" });
  });

  it("fails at the rule step on an engine with no isolate, and sets no timer", async () => {
    const { executor, runs, scheduler } = watchRuns({});

    const failed = await executor.start(watchStart);

    expect(failed).toMatchObject({ status: "failed", state: "match" });
    expect(runs.logs.get("run_1")?.at(-1)).toMatchObject({
      type: "run.failed",
      error:
        'Step "match" is a rule step, and rule steps can\'t run here yet. Remove the step to run this workflow.',
    });
    expect(scheduler.timers.size).toBe(0);
  });
});
