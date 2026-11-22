import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { WorkflowProblem } from "../api.ts";
import {
  arrowProblems,
  cardProblems,
  cardSummary,
  countProblems,
  namedMessage,
  problemLine,
  problemRows,
} from "./problem-lines.ts";

const problem = (
  code: string,
  severity: WorkflowProblem["severity"] = "error",
  stepId?: string,
): WorkflowProblem => ({ severity, code, message: `core says ${code}`, stepId });

verifies("workflows.configuration.problem-lines", () => {
  it("writes a short line for a step's problem, without the step's name", () => {
    expect(problemLine(problem("dead-end", "error", "review"))).toBe("Has no way out");
    expect(problemLine(problem("unreachable", "warning", "review"))).toBe("Can't be reached");
    // An arrow that is never taken says so in the step card row's words (C592 3).
    expect(problemLine(problem("unguarded-shadow", "warning", "review"))).toBe("Never taken");
  });

  it("writes a sentence for a problem of the whole workflow", () => {
    expect(problemLine(problem("no-final"))).toBe("This workflow has no end step.");
    expect(problemLine(problem("missing-initial"))).toBe("This workflow has no first step.");
  });

  it("says an agent's or agent step's missing alias as the problems band does, not the core's Method (C605)", () => {
    const writer = { id: "writer", name: "Writer" };
    const [step, own, bare] = problemRows([
      {
        ...problem("unknown-model-alias"),
        message: 'Method "writer.short" uses unknown model alias "tiny"',
        agent: writer,
        modelAlias: "tiny",
        agentStep: "short",
      },
      { ...problem("unknown-model-alias"), agent: writer, modelAlias: "smrt" },
      problem("unknown-model-alias"),
    ]);
    expect(step?.text).toBe(
      "Writer's agent step short uses the model alias tiny, which this workspace doesn't have. Add it in Models.",
    );
    expect(own?.text).toBe(
      "Writer uses the model alias smrt, which this workspace doesn't have. Pick a model on Writer's page.",
    );
    expect(bare?.text).toBe("core says unknown-model-alias");
  });

  it("shows the core's message when no line is written", () => {
    expect(problemLine(problem("subflow-loop"))).toBe("core says subflow-loop");
  });

  it("lists errors before warnings and keeps the file's order in each group", () => {
    const rows = problemRows([
      problem("unreachable", "warning", "a"),
      problem("dead-end", "error", "b"),
      problem("task-without-agent", "warning", "c"),
      problem("unknown-agent", "error", "d"),
    ]);
    expect(rows.map((row) => row.stepId)).toEqual(["b", "d", "a", "c"]);
    expect(rows.map((row) => row.glyph)).toEqual(["✕", "✕", "△", "△"]);
  });

  it("reads a row with the core's message, its step and its severity", () => {
    const [step, whole] = problemRows([
      problem("unknown-gets", "error", "review"),
      problem("no-final", "warning"),
    ]);
    expect([step?.severity, step?.text, step?.stepId]).toEqual([
      "error",
      "core says unknown-gets",
      "review",
    ]);
    expect([whole?.severity, whole?.text, whole?.stepId]).toEqual([
      "warning",
      "core says no-final",
      undefined,
    ]);
  });

  it("reads the checks a new step gets in Studio's words, not the file's", () => {
    const rows = problemRows([
      problem("task-without-agent", "error", "step-1"),
      problem("dead-end", "error", "step-1"),
      problem("unreachable", "warning", "step-1"),
      problem("wait-without-events", "warning", "wait-1"),
    ]);
    expect(rows.map((row) => row.text)).toEqual([
      "Has no agent, so every run fails here. Pick one on its card, or make it a wait step.",
      "Has no way out. Add an arrow from it on its card, or make it an end step.",
      "Can't be reached: no arrow leads to it.",
      "Gives a person no answers to pick, such as approve. Add them in the workflow's file.",
    ]);
  });

  // C591 row 13: the row used the core's "transition" and gave no next step.
  it("reads a never-taken arrow's row in Studio's words, with what to change", () => {
    const shadowed: WorkflowProblem = {
      severity: "warning",
      code: "unguarded-shadow",
      message: `In "review", the transition to "send" can never fire: an earlier one on "done" has no condition`,
      stepId: "review",
    };
    const [row] = problemRows([shadowed]);
    expect(row?.text).toBe(
      "Has an arrow that's never taken: an earlier arrow on the same event always matches first. Change the order or the conditions in Arrows on its card.",
    );
    expect(row?.stepId).toBe("review");
  });

  it("says answers for a wait step's missing events on its card and its row alike", () => {
    const missing = problem("wait-without-events", "warning", "wait-1");
    expect(cardSummary([missing])).toBe("△ Has no answers to pick");
    expect(problemRows([missing])[0]?.text).toContain("no answers to pick");
  });

  it("gives a wait step's signal a short card line and a row without the step's id (C622 #3)", () => {
    const signal: WorkflowProblem = {
      severity: "error",
      code: "wait-with-signal",
      message: `Wait step "wait-1" can't send a signal. Put signal: on the step after it.`,
      stepId: "wait-1",
    };
    expect(cardProblems([signal], "wait-1")?.line).toBe("Can't send a signal");
    expect(problemRows([signal])[0]?.text).toBe(
      "Can't send a signal: a wait step has no moment to send one. Move the signal to the step after it, in the workflow's file.",
    );
  });

  it("names a step's kind as a wait step or an end step, as validate does, not the Type picker's Wait", () => {
    const lines = [
      problemLine(problem("timer-outside-wait", "error", "write")),
      ...problemRows([
        problem("task-without-agent", "error", "step-1"),
        problem("dead-end", "error", "step-1"),
      ]).map((row) => row.text),
    ];
    expect(lines.join(" ")).not.toMatch(/\b(Wait|End)\b/);
    expect(lines[0]).toBe("Only a wait step has timers");
  });

  it("counts errors and warnings", () => {
    expect(
      countProblems([problem("dead-end"), problem("unreachable", "warning"), problem("no-final")]),
    ).toEqual({ errors: 2, warnings: 1 });
  });

  it("sums up several problems on one card", () => {
    expect(cardSummary([])).toBe("");
    expect(cardSummary([problem("dead-end")])).toBe("✕ Has no way out");
    expect(cardSummary([problem("unreachable", "warning"), problem("dead-end")])).toBe(
      "✕ 2 problems",
    );
    expect(
      cardSummary([problem("unreachable", "warning"), problem("task-without-agent", "warning")]),
    ).toBe("△ 2 warnings");
  });

  it("names a problem's step by its title, as its card does, in the message and the link", () => {
    const unknownAgent: WorkflowProblem = {
      severity: "error",
      code: "unknown-agent",
      message: `"first" uses the agent "nobody-here", which its hub doesn't have`,
      stepId: "first",
    };
    const titles: Record<string, string> = { first: "Ask a missing agent" };
    const nameOf = (stepId: string) => titles[stepId] ?? stepId;

    const [row] = problemRows([unknownAgent], nameOf);
    expect(row?.text).toBe(
      `"Ask a missing agent" uses the agent "nobody-here", which its hub doesn't have`,
    );
    expect([row?.stepId, row?.stepName]).toEqual(["first", "Ask a missing agent"]);
  });

  it("keeps the id of a step with no title, and of a page that doesn't know the titles", () => {
    const unknownAgent = { ...problem("unknown-agent", "error", "first"), message: '"first" x' };
    expect(namedMessage(unknownAgent, (stepId) => stepId)).toBe('"first" x');
    expect(problemRows([unknownAgent])[0]?.stepName).toBe("first");
  });

  it("renames only the step's own quoted id, and keeps a $ in its title as it is", () => {
    const shadow: WorkflowProblem = {
      severity: "warning",
      code: "unguarded-shadow",
      message: 'In "a", the transition to "a" can never fire',
      stepId: "a",
    };
    expect(namedMessage(shadow, () => "Pay $& later")).toBe(
      'In "Pay $& later", the transition to "a" can never fire',
    );
  });
});

verifies("workflows.page.step-problems", () => {
  it("gives a card its step's first problem, errors first, with each full message named", () => {
    const problems: WorkflowProblem[] = [
      {
        severity: "warning",
        code: "unreachable",
        message: '"first" is unreachable',
        stepId: "first",
      },
      { severity: "error", code: "unknown-agent", message: '"first" uses x', stepId: "first" },
      problem("dead-end", "error", "other"),
    ];
    expect(cardProblems(problems, "first", () => "Ask")).toEqual({
      severity: "error",
      glyph: "✕",
      line: "Uses a missing agent",
      detail: '"Ask" uses x\n"Ask" is unreachable',
    });
    expect(cardProblems([problem("unreachable", "warning", "first")], "first")).toMatchObject({
      severity: "warning",
      glyph: "△",
      line: "Can't be reached",
    });
  });

  it("leaves an arrow's problem to the arrow, and a step with none unmarked", () => {
    const arrows = [
      problem("unknown-target", "error", "first"),
      problem("unguarded-shadow", "warning", "first"),
    ];
    expect(cardProblems(arrows, "first")).toBeUndefined();
    expect(cardProblems([], "first")).toBeUndefined();
  });
  it("marks an arrow's plate with that arrow's problems only, the worst first", () => {
    const onArrow = (code: string, severity: WorkflowProblem["severity"], arrowIndex: number) => ({
      ...problem(code, severity, "review"),
      message: `"review" ${code}`,
      arrowIndex,
    });
    const problems = [
      onArrow("unguarded-shadow", "warning", 1),
      onArrow("unknown-target", "error", 1),
      onArrow("unknown-target", "error", 2),
      { ...problem("dead-end", "error", "review"), arrowIndex: 1 },
    ];

    expect(arrowProblems(problems, "review", 1, () => "Check")).toEqual({
      severity: "error",
      glyph: "✕",
      line: "Goes to a missing step",
      detail: '"Check" unknown-target\n"Check" unguarded-shadow',
    });
    expect(arrowProblems(problems, "review", 2)).toMatchObject({
      line: "Goes to a missing step",
    });
    expect(arrowProblems(problems, "review", 0)).toBeUndefined();
    expect(arrowProblems(problems, "other", 1)).toBeUndefined();
  });
});
