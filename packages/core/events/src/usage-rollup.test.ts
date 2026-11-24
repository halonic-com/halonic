import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { RunEvent, RunEventBody } from "./run-event.ts";
import type { RunTask } from "./run-task.ts";
import { type RunUsage, runUsageOf, usageByBranch, usageByTask } from "./usage-rollup.ts";

const branch = "acme/HAL-42-reply";

/** A log of the run `runId`, on `task` when given: `run.started`, then the bodies. */
function runLog(runId: string, task: RunTask | null, ...bodies: RunEventBody[]): RunEvent[] {
  const started: RunEventBody = {
    type: "run.started",
    hubId: "acme",
    workflowId: "reply",
    input: {},
    kind: "run",
    definitionsVersion: "v1",
    ...(task === null ? {} : { task }),
  };
  return [started, ...bodies].map((body, index) => ({
    runId,
    seq: index + 1,
    at: `2026-11-24T10:00:0${index}.000Z`,
    ...body,
  }));
}

function response(
  agent: string,
  inputTokens: number,
  outputTokens: number,
): Extract<RunEventBody, { type: "llm.response" }> {
  return {
    type: "llm.response",
    agent,
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    usage: { inputTokens, outputTokens },
    latencyMs: 900,
    text: "Done.",
    paidBy: "subscription",
  };
}

/** A harness program starting for `agent`, with how its session began when given. */
function harnessStarted(
  state: string,
  agent: string,
  session?: Extract<RunEventBody, { type: "harness.started" }>["session"],
): RunEventBody {
  return {
    type: "harness.started",
    state,
    agent,
    harness: "claude-code",
    timeoutMs: 60_000,
    ...(session === undefined ? {} : { session }),
  };
}

const fresh = { start: "fresh", reason: "no-resume" } as const;

function usageOf(events: RunEvent[]): RunUsage {
  const usage = runUsageOf(events);
  if (usage === null) throw new Error("expected the run's usage");
  return usage;
}

verifies("events.usage-rollup", () => {
  it("counts a sub-agent's tokens on its run, and apart, and a cached answer not at all", () => {
    const usage = usageOf(
      runLog(
        "run-1",
        { id: "HAL-42" },
        { type: "agent.started", state: "draft", agent: "writer", prompt: "Reply" },
        {
          ...response("writer", 100, 20),
          usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 900 },
        },
        {
          type: "agent.started",
          state: "draft",
          agent: "checker",
          prompt: "Check",
          parent: "writer",
        },
        response("checker", 30, 5),
        { ...response("writer", 1000, 200), cached: true },
      ),
    );

    expect(usage).toEqual({
      runId: "run-1",
      parentRunId: null,
      task: { id: "HAL-42" },
      usage: { inputTokens: 130, outputTokens: 25, cacheReadTokens: 900 },
      subAgentUsage: { inputTokens: 30, outputTokens: 5 },
      calls: 2,
      sessions: { fresh: 0, freshReasons: {}, resumed: 0 },
    });
  });

  it("counts an agent's tokens as a sub-agent's only while it runs as one", () => {
    const usage = usageOf(
      runLog(
        "run-1",
        null,
        { type: "agent.started", state: "draft", agent: "writer", prompt: "Reply" },
        {
          type: "agent.started",
          state: "draft",
          agent: "checker",
          prompt: "Check",
          parent: "writer",
        },
        response("checker", 30, 5),
        { type: "agent.started", state: "review", agent: "checker", prompt: "Review" },
        response("checker", 100, 20),
      ),
    );

    expect(usage.usage).toEqual({ inputTokens: 130, outputTokens: 25 });
    expect(usage.subAgentUsage).toEqual({ inputTokens: 30, outputTokens: 5 });
  });

  it("counts fresh harness sessions by reason and resumed ones, and none without a session", () => {
    const usage = usageOf(
      runLog(
        "run-1",
        null,
        harnessStarted("draft", "writer", fresh),
        harnessStarted("check", "checker", { start: "resumed", reason: "no-resume" }),
        harnessStarted("send", "sender", fresh),
        harnessStarted("old", "writer"),
      ),
    );

    expect(usage.task).toBeNull();
    expect(usage.sessions).toEqual({ fresh: 2, freshReasons: { "no-resume": 2 }, resumed: 1 });
  });

  it("adds up two runs on one task per task and per branch, and leaves out a run without one", () => {
    const task = { id: "HAL-42", branch };
    const first = usageOf(
      runLog(
        "run-1",
        task,
        { type: "agent.started", state: "draft", agent: "writer", prompt: "Reply" },
        harnessStarted("draft", "writer", fresh),
        response("writer", 100, 20),
        {
          type: "agent.started",
          state: "draft",
          agent: "checker",
          prompt: "Check",
          parent: "writer",
        },
        response("checker", 30, 5),
      ),
    );
    const second = usageOf(
      runLog(
        "run-2",
        task,
        { type: "agent.started", state: "fix", agent: "writer", prompt: "Fix" },
        harnessStarted("fix", "writer", fresh),
        {
          ...response("writer", 50, 10),
          usage: { inputTokens: 50, outputTokens: 10, cacheWriteTokens: 400 },
        },
      ),
    );
    const untasked = usageOf(runLog("run-3", null, response("writer", 7, 7)));
    const expected = {
      usage: { inputTokens: 180, outputTokens: 35, cacheWriteTokens: 400 },
      subAgentUsage: { inputTokens: 30, outputTokens: 5 },
      calls: 3,
      sessions: { fresh: 2, freshReasons: { "no-resume": 2 }, resumed: 0 },
      runIds: ["run-1", "run-2"],
    };

    expect([...usageByTask([first, untasked, second])]).toEqual([["HAL-42", expected]]);
    expect([...usageByBranch([first, untasked, second])]).toEqual([[branch, expected]]);
  });

  it("leaves out a run whose task names no branch when adding up per branch", () => {
    const run = usageOf(runLog("run-1", { id: "HAL-42" }, response("writer", 1, 1)));

    expect(usageByBranch([run]).size).toBe(0);
    expect(usageByTask([run]).get("HAL-42")?.runIds).toEqual(["run-1"]);
  });

  it("names the parent run of a child run", () => {
    const [started, ...rest] = runLog("child-1", { id: "HAL-42" });
    if (started?.type !== "run.started") throw new Error("expected run.started");
    const child = usageOf([
      { ...started, parent: { runId: "run-1", state: "sub", depth: 1 } },
      ...rest,
    ]);

    expect(child.parentRunId).toBe("run-1");
  });

  it("has no usage for a log that doesn't start with run.started", () => {
    expect(runUsageOf([])).toBeNull();
    expect(runUsageOf(runLog("run-1", null).slice(1))).toBeNull();
    expect(
      runUsageOf([
        { runId: "run-1", seq: 1, at: "2026-11-24T10:00:00.000Z", ...response("a", 1, 1) },
      ]),
    ).toBeNull();
  });
});
