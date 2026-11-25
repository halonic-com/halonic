import type { SendingSettings } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import type { Connector, Workflow, WorkflowState } from "@halonicjs/format";
import {
  type ConnectorTool,
  type ToolScriptIsolate,
  type ToolScriptIsolateResult,
  toolScriptDefaultLimits,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns } from "../kernel/kernel-test-kit.test-helper.ts";
import { ScriptedConnector } from "../testing/scripted-model.ts";
import type { RunConnectorCalls } from "./connector-calls.ts";
import { type RunsSetup, runsOn } from "./local-runs-test-kit.test-helper.ts";

const rulePath = "rules/match.rule.js";

/** The rule step `match` decides which pull request to merge, the tool step `merge` merges it. */
function watchWorkflow(merge: Partial<WorkflowState> = {}): Workflow {
  return {
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
        output: "decisions",
        on: [{ to: "merge", event: "done" }],
      },
      merge: {
        type: "tool",
        connector: "github",
        tool: "merge_pull_request",
        with: { pr: "{{context.decisions.merge}}" },
        output: "merged",
        on: [
          { to: "done", event: "done" },
          { to: "left", event: "rejected" },
          { to: "left", event: "skipped" },
        ],
        ...merge,
      },
      done: {
        type: "final",
        signal: { name: "pr.merged", data: { sha: "{{context.merged.sha}}" } },
        on: [],
      },
      left: { type: "final", on: [] },
    },
  };
}

/** A rule that always decides to merge pull request 7. */
const isolate: ToolScriptIsolate = {
  limits: toolScriptDefaultLimits.user,
  run: async (): Promise<ToolScriptIsolateResult> => ({
    ok: true,
    output: { merge: 7 },
    log: [],
    limits: toolScriptDefaultLimits.agent,
  }),
};

const mergeTool: ConnectorTool = {
  name: "merge_pull_request",
  description: "Merges a pull request",
  parameters: { type: "object", properties: { pr: { type: "number" } } },
};

/** The GitHub connector, which counts its listings as well as its calls. */
class GitHub extends ScriptedConnector {
  listings = 0;

  constructor(answer: (name: string) => string = () => '{"sha":"abc1234"}') {
    super("github", [mergeTool], answer);
  }

  override async listTools(): Promise<ConnectorTool[]> {
    this.listings += 1;
    return super.listTools();
  }
}

const sending: SendingSettings = { checkSending: async () => ({ allowed: true }) };
const connectorCalls: RunConnectorCalls = {
  location: "/workspaces/acme",
  sending,
  reportSettingsError: () => {},
};

/** The workspace marks the tool as only reading, so it runs without asking. */
const marksRead: Connector["tools"] = { approve: [], read: ["merge_pull_request"] };

/**
 * The watch workflow's runs, on an engine whose every model call fails. It makes connector calls
 * unless `setup` leaves `connectorCalls` out.
 */
function watchRuns(
  github: GitHub,
  tools: Connector["tools"],
  setup: RunsSetup = { connectorCalls },
) {
  return runsOn([], new KernelRuns(), {
    workflow: watchWorkflow(),
    rules: { [rulePath]: "export function run() { return { merge: 7 }; }" },
    toolScriptIsolate: isolate,
    connectors: [github],
    connectorTools: { github: tools },
    onResolveModel: () => {
      throw new Error("No model is configured.");
    },
    ...setup,
  });
}

const watchStart = { hubId: "acme", workflowId: "watch", input: {} };

function ofType(log: readonly RunEvent[] | undefined, ...types: string[]): RunEvent[] {
  return (log ?? []).filter((event) => types.includes(event.type));
}

verifies("engine.tool-state", () => {
  it("calls the tool with the rule's output, with no model, and the next step reads its result", async () => {
    const github = new GitHub();
    const { executor, runs, scheduler } = watchRuns(github, marksRead);

    await executor.start(watchStart);
    await scheduler.runDue();

    expect(github.calls).toEqual([{ name: "merge_pull_request", args: { pr: 7 } }]);
    expect(github.idempotencyKeys).toEqual(["run_1:call-1"]);
    const log = runs.logs.get("run_1");
    expect(ofType(log, "llm.request", "llm.response", "agent.started")).toEqual([]);
    expect(ofType(log, "effect.requested", "tool.result")).toMatchObject([
      { agent: "merge", step: "tool", tool: "merge_pull_request", args: { pr: 7 } },
      { agent: "merge", tool: "merge_pull_request", outcome: "ok" },
    ]);
    expect(ofType(log, "signal.sent")).toMatchObject([{ data: { sha: "abc1234" } }]);
    expect(log?.at(-1)).toMatchObject({ type: "run.completed", state: "done" });
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });

  it("fails before any listing or call when tools.allow doesn't name the tool", async () => {
    const github = new GitHub();
    const { executor, runs, scheduler } = watchRuns(github, { ...marksRead, allow: ["get_pr"] });

    await executor.start(watchStart);
    await scheduler.runDue();

    expect(github.listings).toBe(0);
    expect(github.calls).toEqual([]);
    expect(runs.logs.get("run_1")?.at(-1)).toMatchObject({
      type: "run.failed",
      state: "merge",
      error:
        'Tool step "merge" calls merge_pull_request, which the tools.allow list of connector "github" doesn\'t name.',
    });
  });

  it("waits for a person's OK on a tool the read list doesn't name, and makes the call once", async () => {
    const github = new GitHub();
    const { executor, runs, scheduler } = watchRuns(github, { approve: [] });

    await executor.start(watchStart);
    await scheduler.runDue();

    expect(github.calls).toEqual([]);
    expect(await runs.get("run_1")).toMatchObject({ status: "waiting" });
    expect(ofType(runs.logs.get("run_1"), "approval.requested", "run.waiting")).toMatchObject([
      { agent: "merge", step: "tool", connector: "github", args: { pr: 7 } },
      { state: "merge", events: ["approve", "reject"] },
    ]);

    await executor.send("run_1", "approve");
    await scheduler.runDue(2);

    expect(github.calls).toEqual([{ name: "merge_pull_request", args: { pr: 7 } }]);
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });

  it("asks when the server lists the tool as send, though the read list names it", async () => {
    const github = new GitHub();
    github.listTools = async () => [{ ...mergeTool, risk: "send" }];
    const { executor, runs, scheduler } = watchRuns(github, marksRead);

    await executor.start(watchStart);
    await scheduler.runDue();

    expect(github.calls).toEqual([]);
    expect(ofType(runs.logs.get("run_1"), "approval.requested")).toMatchObject([
      { tool: "merge_pull_request", step: "tool" },
    ]);
  });

  it("calls with the arguments the approval showed, not ones rendered again after the OK", async () => {
    const github = new GitHub();
    const { executor, runs, scheduler } = watchRuns(github, { approve: ["merge_pull_request"] });
    await executor.start(watchStart);
    await scheduler.runDue();
    const log = runs.logs.get("run_1") ?? [];
    const last = log.at(-1) as RunEvent;
    // The context changes while the run waits, as a log written by another engine could.
    log.push({
      ...last,
      seq: last.seq + 1,
      type: "context.updated",
      key: "decisions",
      value: { merge: 9 },
    });
    runs.snapshots.delete("run_1");

    await executor.send("run_1", "approve");
    await scheduler.runDue();

    expect(github.calls).toEqual([{ name: "merge_pull_request", args: { pr: 7 } }]);
    expect(ofType(runs.logs.get("run_1"), "effect.requested")).toMatchObject([{ args: { pr: 7 } }]);
  });

  it("takes the rejected transition when a person says no, and makes no call", async () => {
    const github = new GitHub();
    const { executor, runs, scheduler } = watchRuns(github, { approve: [] });
    await executor.start(watchStart);
    await scheduler.runDue();

    await executor.send("run_1", "reject");
    await scheduler.runDue();

    expect(github.calls).toEqual([]);
    expect(ofType(runs.logs.get("run_1"), "transition").at(-1)).toMatchObject({
      from: "merge",
      to: "left",
      event: "rejected",
    });
    expect(runs.logs.get("run_1")?.at(-1)).toMatchObject({ type: "run.completed", state: "left" });
  });

  it("waits for retry or skip after a call that broke off, and retries it once under the same key", async () => {
    let attempts = 0;
    const github = new GitHub(() => {
      attempts += 1;
      if (attempts === 1) throw new Error("the connection dropped");
      return '{"sha":"abc1234"}';
    });
    const { executor, runs, scheduler } = watchRuns(github, marksRead);
    await executor.start(watchStart);
    await scheduler.runDue();
    expect(await runs.get("run_1")).toMatchObject({ status: "waiting" });
    expect(ofType(runs.logs.get("run_1"), "run.waiting").at(-1)).toMatchObject({
      events: ["retry", "skip"],
    });

    await executor.send("run_1", "retry");
    await scheduler.runDue(2);

    expect(github.idempotencyKeys).toEqual(["run_1:call-1", "run_1:call-1"]);
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });

  it("takes the skipped transition when a person skips a call that broke off", async () => {
    const github = new GitHub(() => {
      throw new Error("the connection dropped");
    });
    const { executor, runs, scheduler } = watchRuns(github, marksRead);
    await executor.start(watchStart);
    await scheduler.runDue();

    await executor.send("run_1", "skip");
    await scheduler.runDue();

    expect(github.calls).toHaveLength(1);
    expect(runs.logs.get("run_1")?.at(-1)).toMatchObject({ type: "run.completed", state: "left" });
  });

  it("fails at the tool step on an engine that makes no connector calls", async () => {
    const github = new GitHub();
    const { executor, runs, scheduler } = watchRuns(github, marksRead, {});

    await executor.start(watchStart);
    await scheduler.runDue();

    expect(github.listings).toBe(0);
    expect(runs.logs.get("run_1")?.at(-1)).toMatchObject({
      type: "run.failed",
      state: "merge",
      error:
        'Step "merge" is a tool step, and tool steps can\'t call connectors here yet. Remove the step to run this workflow.',
    });
  });
});
