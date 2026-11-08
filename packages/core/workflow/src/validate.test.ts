import { parseFile } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { mailWorkflow, mailWorkflowFile } from "./test/mail-workflow.spec.ts";
import { triage, workflowOf } from "./test/workflow.spec.ts";
import { validateWorkflow } from "./validate.ts";
import type { WorkflowIssue } from "./workflow-issue.ts";

const codes = (issues: WorkflowIssue[]) => issues.map((found) => found.code);

/** A workflow with one state besides `end`, reached from the start. */
const oneState = (state: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  workflowOf({
    id: "w",
    name: "W",
    initial: "s",
    states: { s: state, end: { type: "final" }, ...extra },
  });

verifies("workflow.validate", () => {
  // Ported from "validation" › "accepts a sound workflow" at 784f78d.
  it("accepts a sound workflow", () => {
    const issues = validateWorkflow(triage, { agents: ["classifier", "support"] });
    expect(issues.filter((found) => found.severity === "error")).toEqual([]);
  });

  // Ported from "validation" › "finds dead ends, unknown targets, unknown agents and
  // unreachable states" at 784f78d.
  it("finds dead ends, unknown targets, unknown agents and unreachable states", () => {
    const bad = workflowOf({
      id: "bad",
      name: "Bad",
      initial: "a",
      states: {
        a: { agent: "ghost", on: [{ to: "nowhere" }] },
        b: { agent: "x" },
        c: { type: "final" },
      },
    });
    expect(codes(validateWorkflow(bad, { agents: ["x"] }))).toEqual(
      expect.arrayContaining(["unknown-target", "unknown-agent", "dead-end", "unreachable"]),
    );
  });

  // New: one case for each of the other checks.
  it("names a missing initial state, and then checks no reachability", () => {
    const issues = validateWorkflow(
      workflowOf({ id: "w", name: "W", initial: "start", states: {} }),
    );
    expect(issues).toEqual([
      {
        severity: "error",
        code: "missing-initial",
        message: 'Initial state "start" does not exist',
      },
      { severity: "warning", code: "no-final", message: "Workflow has no final state" },
    ]);
  });

  it("warns about final states with transitions, tasks without an agent and waits on done only", () => {
    const workflow = oneState(
      { on: [{ to: "wait" }] },
      {
        wait: { type: "wait", on: [{ to: "stop" }] },
        stop: { type: "final", on: [{ to: "end" }] },
      },
    );
    expect(codes(validateWorkflow(workflow))).toEqual([
      "task-without-agent",
      "wait-without-events",
      "final-has-transitions",
    ]);
  });

  it("refuses timers outside wait states and warns about transitions that never fire", () => {
    const workflow = oneState({
      agent: "a",
      on: [{ to: "end", after: "1h" }, { to: "end" }, { to: "end", when: { exists: "input.x" } }],
    });
    expect(validateWorkflow(workflow)).toEqual([
      {
        severity: "error",
        code: "timer-outside-wait",
        state: "s",
        message: '"s" has a timer (after 1h); timers only work on wait states',
      },
      {
        severity: "warning",
        code: "unguarded-shadow",
        state: "s",
        message:
          'In "s", the transition to "end" can never fire: an earlier one on "done" has no condition',
      },
    ]);
  });

  it("checks what a for-each step needs", () => {
    const neither = oneState({ type: "foreach", on: [{ to: "end" }] });
    expect(codes(validateWorkflow(neither))).toEqual([
      "foreach-without-items",
      "foreach-without-work",
    ]);
    const both = oneState({
      type: "foreach",
      items: "{{context.list}}",
      agent: "a",
      workflow: "x",
      on: [{ to: "end" }],
    });
    expect(codes(validateWorkflow(both))).toEqual(["foreach-without-work"]);
  });

  it("checks the workflow a step runs: one is named, it isn't this one, and the hub has it", () => {
    expect(codes(validateWorkflow(oneState({ type: "workflow", on: [{ to: "end" }] })))).toEqual([
      "workflow-without-target",
    ]);
    const self = oneState({ type: "workflow", workflow: "w", on: [{ to: "end" }] });
    expect(codes(validateWorkflow(self, { workflows: [] }))).toEqual(["self-subflow"]);
    const other = oneState({
      type: "foreach",
      items: "{{input.list}}",
      workflow: "x",
      on: [{ to: "end" }],
    });
    expect(codes(validateWorkflow(other))).toEqual([]);
    expect(codes(validateWorkflow(other, { workflows: ["y"] }))).toEqual(["unknown-workflow"]);
  });

  it("checks parallel steps have branches with known agents", () => {
    expect(codes(validateWorkflow(oneState({ type: "parallel", on: [{ to: "end" }] })))).toEqual([
      "parallel-without-branches",
    ]);
    const branches = { one: { agent: "a" }, two: { agent: "ghost" } };
    const parallel = oneState({ type: "parallel", branches, on: [{ to: "end" }] });
    expect(validateWorkflow(parallel)).toEqual([]);
    expect(validateWorkflow(parallel, { agents: ["a"] })).toEqual([
      {
        severity: "error",
        code: "unknown-agent",
        state: "s",
        message: 'Branch "two" of "s" uses unknown agent "ghost"',
      },
    ]);
  });
});

verifies("workflow.validate-gets", () => {
  // Ported from "picked data (gets)" › "flags a pick that no earlier step writes, and rejects
  // malformed paths" at 784f78d. `format` refuses the malformed path when it reads the file; its
  // own case is "refuses a timer without a unit and gets outside input and context" in
  // packages/core/format/src/kinds/workflow/workflow.test.ts.
  it("flags a pick that no earlier step writes, and rejects malformed paths", () => {
    expect(validateWorkflow(mailWorkflow).filter((found) => found.code === "unknown-gets")).toEqual(
      [],
    );
    const tag = { ...mailWorkflowFile.states.tag };
    const bad = workflowOf({
      ...mailWorkflowFile,
      states: { ...mailWorkflowFile.states, tag: { ...tag, gets: ["context.check"] } },
    });
    expect(
      validateWorkflow(bad)
        .filter((found) => found.code === "unknown-gets")
        .map((found) => found.message),
    ).toEqual(['"tag" gets context.check, but no earlier step writes context.check']);
    const malformed = {
      ...mailWorkflowFile,
      states: { ...mailWorkflowFile.states, tag: { ...tag, gets: ["tags"] } },
    };
    const parsed = parseFile("workflow", JSON.stringify(malformed));
    expect(parsed.ok).toBe(false);
    expect(JSON.stringify(parsed)).toMatch(/input\.<name>/);
  });

  // New.
  it("checks only the first part of a context path, and leaves input paths alone", () => {
    const deep = oneState({
      agent: "a",
      gets: ["context.missing.deep", "input.anything"],
      on: [{ to: "end" }],
    });
    expect(validateWorkflow(deep).map((found) => found.message)).toEqual([
      '"s" gets context.missing.deep, but no earlier step writes context.missing',
    ]);
  });
});
