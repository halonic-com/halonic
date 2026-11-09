import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { workflowOf } from "./test/workflow.spec.ts";
import { validateWorkflow } from "./validate.ts";
import type { ValidateOptions } from "./workflow-issue.ts";

/** Each issue as `code at path`, the path joined with dots. */
function places(states: Record<string, unknown>, options: ValidateOptions = {}): string[] {
  const workflow = workflowOf({ id: "w", name: "W", initial: "s", states });
  return validateWorkflow(workflow, options).map(
    (found) => `${found.code} at ${found.path.join(".")}`,
  );
}

const end = { type: "final" };

verifies("workflow.validate-paths", () => {
  it("points at the initial key, or at the whole file for a workflow without a final state", () => {
    const workflow = workflowOf({ id: "w", name: "W", initial: "start", states: {} });
    expect(validateWorkflow(workflow).map((found) => found.path)).toEqual([["initial"], []]);
  });

  it("points at the transition, the gets entry or the key a rule is about", () => {
    const states = {
      s: {
        agent: "ghost",
        gets: ["input.x", "context.nope"],
        on: [{ to: "end", when: { exists: "input.x" } }, { to: "nowhere" }],
      },
      end,
      lost: { agent: "a" },
    };
    expect(places(states, { agents: ["a"] })).toEqual([
      "unknown-target at states.s.on.1.to",
      "unknown-gets at states.s.gets.1",
      "unknown-agent at states.s.agent",
      "dead-end at states.lost",
      "unreachable at states.lost",
    ]);
  });

  it("points at a timer, a hidden transition and a final state's transitions", () => {
    const states = {
      s: {
        agent: "a",
        on: [{ to: "wait", after: "1h" }, { to: "wait" }, { to: "end" }],
      },
      wait: { type: "wait", on: [{ to: "stop" }] },
      stop: { type: "final", on: [{ to: "end" }] },
      end,
    };
    expect(places(states)).toEqual([
      "timer-outside-wait at states.s.on.0.after",
      "unguarded-shadow at states.s.on.2",
      "wait-without-events at states.wait",
      "final-has-transitions at states.stop.on",
    ]);
  });

  it("points at the step for what it lacks, and at the workflow or agent it names", () => {
    const states = {
      s: { type: "foreach", on: [{ to: "self" }] },
      self: { type: "workflow", workflow: "w", on: [{ to: "other" }] },
      other: { type: "workflow", workflow: "x", on: [{ to: "none" }] },
      none: { type: "workflow", on: [{ to: "branches" }] },
      branches: { type: "parallel", on: [{ to: "named" }] },
      named: { type: "parallel", branches: { one: { agent: "ghost" } }, on: [{ to: "bare" }] },
      bare: { on: [{ to: "end" }] },
      end,
    };
    expect(places(states, { agents: [], workflows: [] })).toEqual([
      "foreach-without-items at states.s",
      "foreach-without-work at states.s",
      "self-subflow at states.self.workflow",
      "unknown-workflow at states.other.workflow",
      "workflow-without-target at states.none",
      "parallel-without-branches at states.branches",
      "unknown-agent at states.named.branches.one.agent",
      "task-without-agent at states.bare",
    ]);
  });
});
