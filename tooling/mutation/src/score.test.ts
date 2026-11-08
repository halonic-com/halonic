import { describe, expect, test } from "vitest";
import { type MutationReport, scoreOf, summaryTable } from "./score.ts";

function report(...statuses: string[]): MutationReport {
  return { files: { "src/a.ts": { mutants: statuses.map((status) => ({ status })) } } };
}

describe("mutation.score-per-package", () => {
  test("counts killed and timed-out mutants as detected, survived and uncovered as not", () => {
    const score = scoreOf(
      report("Killed", "Killed", "Killed", "Timeout", "Survived", "NoCoverage", "Ignored"),
    );
    expect(score).toEqual({ detected: 4, survived: 2, noCoverage: 1, errors: 0, score: 66.7 });
  });

  test("leaves compile and runtime errors out of the score", () => {
    expect(scoreOf(report("Killed", "CompileError", "RuntimeError"))).toEqual({
      detected: 1,
      survived: 0,
      noCoverage: 0,
      errors: 2,
      score: 100,
    });
  });

  test("adds up the mutants of every file", () => {
    const twoFiles: MutationReport = {
      files: {
        "src/a.ts": { mutants: [{ status: "Killed" }] },
        "src/b.ts": { mutants: [{ status: "Survived" }] },
      },
    };
    expect(scoreOf(twoFiles).score).toBe(50);
  });

  test("has no score when there was nothing to score", () => {
    expect(scoreOf(report("CompileError")).score).toBeNull();
    expect(scoreOf({ files: {} }).score).toBeNull();
  });

  test("writes one row per package into the job summary", () => {
    const table = summaryTable([
      {
        name: "yaml",
        kind: "scored",
        score: scoreOf(report("Killed", "Killed", "Killed", "Killed", "Survived")),
      },
      { name: "schema-kit", kind: "scored", score: scoreOf(report("CompileError")) },
      { name: "workflow", kind: "no-code" },
      { name: "routines", kind: "failed", reason: "Stryker exited with 1" },
    ]);
    // The table lines after the header and its separator line.
    const rows = table
      .split("\n")
      .filter((line) => line.startsWith("|"))
      .slice(2);
    expect(rows).toEqual([
      "| yaml | 80.0% | 4 | 1 | 0 | 0 |",
      "| schema-kit | no mutants | 0 | 0 | 0 | 1 |",
      "| workflow | no code yet | | | | |",
      "| routines | failed: Stryker exited with 1 | | | | |",
    ]);
    expect(table).toContain("Report only");
  });
});
