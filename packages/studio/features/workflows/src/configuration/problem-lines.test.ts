import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { WorkflowProblem } from "../api.ts";
import { cardSummary, countProblems, problemLine, problemRows } from "./problem-lines.ts";

const problem = (
  code: string,
  severity: WorkflowProblem["severity"] = "error",
  stepId?: string,
): WorkflowProblem => ({ severity, code, message: `core says ${code}`, stepId });

verifies("workflows.configuration.problem-lines", () => {
  it("writes a short line for a step's problem, without the step's name", () => {
    expect(problemLine(problem("dead-end", "error", "review"))).toBe("has no way out");
    expect(problemLine(problem("unreachable", "warning", "review"))).toBe("can't be reached");
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

  it("reads a row with its step and its severity", () => {
    const [step, whole] = problemRows([
      problem("dead-end", "error", "review"),
      problem("no-final", "warning"),
    ]);
    expect(step?.spoken).toBe("Error: review has no way out");
    expect(whole?.spoken).toBe("Warning: This workflow has no end step.");
  });

  it("counts errors and warnings", () => {
    expect(
      countProblems([problem("dead-end"), problem("unreachable", "warning"), problem("no-final")]),
    ).toEqual({ errors: 2, warnings: 1 });
  });

  it("sums up several problems on one card", () => {
    expect(cardSummary([])).toBe("");
    expect(cardSummary([problem("dead-end")])).toBe("✕ has no way out");
    expect(cardSummary([problem("unreachable", "warning"), problem("dead-end")])).toBe(
      "✕ 2 problems",
    );
    expect(
      cardSummary([problem("unreachable", "warning"), problem("task-without-agent", "warning")]),
    ).toBe("△ 2 warnings");
  });
});
