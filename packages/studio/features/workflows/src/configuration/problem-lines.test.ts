import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { WorkflowProblem } from "../api.ts";
import {
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
  });

  it("writes a sentence for a problem of the whole workflow", () => {
    expect(problemLine(problem("no-final"))).toBe("This workflow has no end step.");
    expect(problemLine(problem("missing-initial"))).toBe("This workflow has no first step.");
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
      "Has no agent, so every run fails here. Pick one on its card, or make it a Wait.",
      "Has no way out. Add an arrow from it on its card, or make it an End.",
      "Can't be reached: no arrow leads to it.",
      "Gives a person no answers to pick, such as approve. Add them in the workflow's file.",
    ]);
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
      message: '"first" uses unknown agent "nobody-here"',
      stepId: "first",
    };
    const titles: Record<string, string> = { first: "Ask a missing agent" };
    const nameOf = (stepId: string) => titles[stepId] ?? stepId;

    const [row] = problemRows([unknownAgent], nameOf);
    expect(row?.text).toBe('"Ask a missing agent" uses unknown agent "nobody-here"');
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
});
