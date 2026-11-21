import type { WorkflowTestCase } from "@halonicjs/format";
import { nearMatch } from "@halonicjs/std";
import type { LoadedFileOf, WorkspaceIssue } from "../load-workspace.ts";
import type { CheckContext } from "./check-context.ts";
import { type AgentUse, agentUsesOf } from "./workflow-agents.ts";

type Test = LoadedFileOf<"workflowTest">;
type Workflow = LoadedFileOf<"workflow">;
type Agent = LoadedFileOf<"agent">["value"];

/** The script key whose replies go to every agent without its own (the mock model's `*`). */
const anyAgent = "*";

/**
 * What a workflow test names in its workflow, checked before any test runs
 * (C337 C18, HAL-14270): each agent it mocks is one the workflow uses, each
 * mocked reply of an agent that must answer with one of its options is one
 * of them (a warning: a test may expect the run to fail), and the steps in
 * `expect.final` and `expect.states` are the workflow's. A test of a
 * workflow that isn't there gets only `checkTestTargets`' error.
 */
export function checkWorkflowTests(context: CheckContext): WorkspaceIssue[] {
  const issues: WorkspaceIssue[] = [];
  for (const test of context.filesOf("workflowTest")) {
    const workflow = context
      .filesOf("workflow", test.hub)
      .find((each) => each.value.id === test.value.workflow);
    if (context.hubFailed(test.hub) || workflow === undefined) {
      continue;
    }
    const tested = new TestedWorkflow(context, workflow);
    test.value.cases.forEach((testCase, index) => {
      const at = ["cases", index];
      issues.push(...mockIssues(context, test, tested, testCase, at));
      issues.push(...expectIssues(context, test, tested, testCase, at));
    });
  }
  return issues;
}

/** What a test is checked against: the workflow's steps, and the agents its runs call. */
class TestedWorkflow {
  readonly steps: readonly string[];
  /** `undefined` when a workflow or agent it reaches didn't parse: then mocks aren't checked. */
  readonly uses: ReadonlyMap<string, AgentUse> | undefined;
  readonly agents: ReadonlyMap<string, Agent>;

  constructor(context: CheckContext, workflow: Workflow) {
    this.steps = Object.keys(workflow.value.states);
    this.uses = agentUsesOf(context, workflow);
    this.agents = new Map(
      context.filesOf("agent", workflow.hub).map((agent) => [agent.value.id, agent.value]),
    );
  }
}

function mockIssues(
  context: CheckContext,
  test: Test,
  tested: TestedWorkflow,
  testCase: WorkflowTestCase,
  at: (string | number)[],
): WorkspaceIssue[] {
  const uses = tested.uses;
  if (uses === undefined) {
    return [];
  }
  return Object.entries(testCase.mocks).flatMap(([agentId, replies]) => {
    if (agentId === anyAgent) {
      return [];
    }
    const path = [...at, "mocks", agentId];
    const use = uses.get(agentId);
    if (use === undefined) {
      const used = [...uses.keys()];
      const otherwise =
        used.length === 0
          ? "It runs no agent, so remove the mock."
          : `Mock only the agents it uses: ${inWords(used, "and")}.`;
      const message = `The test mocks the agent ${agentId}, which the workflow doesn't use. ${guess(agentId, used, otherwise)}`;
      return [context.error(test.path, path, "unknown-mock-agent", message)];
    }
    return replyIssues(context, test, path, tested.agents.get(agentId), use, replies);
  });
}

/**
 * Each mocked reply of an agent whose every call must answer with one of
 * its options. A reply of `tool:` lines calls tools and isn't an answer.
 */
function replyIssues(
  context: CheckContext,
  test: Test,
  path: (string | number)[],
  agent: Agent | undefined,
  use: AgentUse,
  replies: readonly string[],
): WorkspaceIssue[] {
  const output = agent?.output;
  if (agent === undefined || output?.type !== "choice" || !use.onlyAsItsOwnOutput) {
    return [];
  }
  return replies.flatMap((reply, index) => {
    const answer = reply.trim();
    if (answer.startsWith("tool:") || output.options.includes(answer)) {
      return [];
    }
    const message = `The mocked reply ${JSON.stringify(reply)} isn't one of ${agent.id}'s options, so the run fails at that step. Use ${inWords(output.options, "or")}.`;
    return [context.issue("warning", test.path, [...path, index], "mock-not-an-option", message)];
  });
}

function expectIssues(
  context: CheckContext,
  test: Test,
  tested: TestedWorkflow,
  testCase: WorkflowTestCase,
  at: (string | number)[],
): WorkspaceIssue[] {
  const issues: WorkspaceIssue[] = [];
  const unknownStep = (step: string, path: (string | number)[], said: string) => {
    if (tested.steps.includes(step)) {
      return;
    }
    const message = `${said}, but the workflow has no step ${step}. ${guess(step, tested.steps, `Its steps are ${inWords(tested.steps, "and")}.`)}`;
    issues.push(context.error(test.path, path, "unknown-expected-step", message));
  };
  const { final, states } = testCase.expect;
  if (final !== undefined) {
    unknownStep(final, [...at, "expect", "final"], `expect.final is "${final}"`);
  }
  states?.forEach((step, index) => {
    unknownStep(step, [...at, "expect", "states", index], `expect.states names "${step}"`);
  });
  return issues;
}

/** "Did you mean sorter?" when one name is near what was typed, or else `otherwise`. */
function guess(typed: string, names: readonly string[], otherwise: string): string {
  const near = nearMatch(typed, names);
  return near === undefined ? otherwise : `Did you mean ${near}?`;
}

/** "a", "a and b", "a, b and c"; with "or" for a choice. */
function inWords(names: readonly string[], last: "and" | "or"): string {
  if (names.length <= 1) {
    return names.join("");
  }
  return `${names.slice(0, -1).join(", ")} ${last} ${names.at(-1)}`;
}
