import type { RunEventBody } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { entered, logOf } from "./run-log.test-helper.ts";
import { stepBlockedSites, stepChildRuns, stepEvents } from "./step-events-model.ts";

const answered = (
  model: string,
  inputTokens: number,
  outputTokens: number,
  cached?: true,
): RunEventBody => ({
  type: "llm.response",
  agent: "writer",
  provider: "anthropic",
  model,
  usage: { inputTokens, outputTokens },
  latencyMs: 900,
  text: "",
  ...(cached === undefined ? {} : { cached }),
});

const called = (tool: string, args: unknown): RunEventBody => ({
  type: "tool.called",
  agent: "writer",
  tool,
  args,
});

// Events 6 and 7 are a parallel branch's, inside step Draft.
const events = logOf("run_a_01jd8q", [
  [0, entered("read")],
  [0, answered("claude-haiku", 80, 12)],
  [1, entered("draft")],
  [1, answered("claude-sonnet", 1204, 312)],
  [1, called("send_email", { to: "sam@acme.example" })],
  [1, entered("check")],
  [2, answered("claude-sonnet", 10, 2, true)],
  [2, entered("review")],
]).map((event) => (event.seq === 6 || event.seq === 7 ? { ...event, branch: "facts" } : event));

verifies("runs.run-view.step-events", () => {
  it("gives a step its own model calls with their tokens, and its tool calls with their arguments", () => {
    expect(stepEvents(events, "step-1")).toEqual({
      modelCalls: [
        { id: 5, model: "claude-sonnet", tokens: "1,204 in · 312 out" },
        { id: 8, model: "claude-sonnet", tokens: "cached, no model call" },
      ],
      toolCalls: [{ id: 6, tool: "send_email", args: '{\n  "to": "sam@acme.example"\n}' }],
    });
    expect(stepEvents(events, "step-0").modelCalls).toEqual([
      { id: 3, model: "claude-haiku", tokens: "80 in · 12 out" },
    ]);
  });

  it("has nothing for a step without calls", () => {
    expect(stepEvents(events, "step-2")).toEqual({ modelCalls: [], toolCalls: [] });
  });

  it("escapes hidden and direction-changing characters in the tool's name and its arguments", () => {
    const sneaky = logOf("run_a_01jd8q", [
      [0, entered("draft")],
      [0, called("send\u202Eliame", { subject: "Hi\u200B" })],
    ]);

    const [call] = stepEvents(sneaky, "step-0").toolCalls;
    expect(call?.tool).toBe("send\\u202eliame");
    expect(call?.args).toContain("Hi\\u200b");
  });
});

const refused = (host: string, count: number, branch?: string): RunEventBody => ({
  type: "sandbox.blocked",
  state: "install",
  agent: "writer",
  block: { kind: "network", host, port: 443 },
  count,
  ...(branch === undefined ? {} : { branch }),
});

verifies("runs.run-view.blocked-sites", () => {
  const blocked = logOf("run_a_01jd8q", [
    [0, entered("read")],
    [1, entered("install")],
    [1, refused("registry.npmjs.org", 1)],
    [1, refused("registry.npmjs.org", 12)],
    [1, refused("cdn.example", 2, "docs")],
    [2, entered("check")],
  ]);

  it("gives a step the sites its sandbox refused, a branch's apart, with the agent's name", () => {
    const install = stepBlockedSites(blocked, "step-1");

    expect(install.map(({ agent, sites }) => [agent, sites.branch, sites.sites])).toEqual([
      ["Writer", undefined, [{ host: "registry.npmjs.org", tries: 12 }]],
      ["Writer", "docs", [{ host: "cdn.example", tries: 2 }]],
    ]);
  });

  it("has none for a step whose sandbox refused nothing", () => {
    expect(stepBlockedSites(blocked, "step-0")).toEqual([]);
    expect(stepBlockedSites(blocked, "step-2")).toEqual([]);
  });
});

const started = (
  state: string,
  workflow: string,
  childRunId: string,
  item?: number,
): RunEventBody => ({
  type: "workflow.started",
  state,
  workflow,
  childRunId,
  ...(item === undefined ? {} : { item }),
});

const withChildren = logOf("run_a_01jd8q", [
  [0, entered("read")],
  [1, entered("check")],
  [1, started("check", "verify", "run_a_01jd8q.4")],
  [2, entered("each")],
  [2, started("each", "verify", "run_a_01jd8q.6.0", 0)],
  [2, started("each", "verify", "run_a_01jd8q.6.1", 1)],
]);

const workflowName = (id: string) => (id === "verify" ? "Verify" : id);

verifies("runs.run-view.child-runs", () => {
  it("names the child run a step started, with its short id", () => {
    expect(stepChildRuns(withChildren, "step-1", workflowName)).toEqual([
      { runId: "run_a_01jd8q.4", started: "Started Verify", link: "Run jd8q.4" },
    ]);
  });

  it("names each for-each item's child run, in the order they started", () => {
    expect(stepChildRuns(withChildren, "step-2", workflowName).map((child) => child.runId)).toEqual(
      ["run_a_01jd8q.6.0", "run_a_01jd8q.6.1"],
    );
  });

  it("has none for a step that started no child run", () => {
    expect(stepChildRuns(withChildren, "step-0", workflowName)).toEqual([]);
  });

  it("escapes hidden and direction-changing characters in the workflow's name", () => {
    const [child] = stepChildRuns(withChildren, "step-1", () => "Ver\u202eify");
    expect(child?.started).toBe("Started Ver\\u202eify");
  });
});
