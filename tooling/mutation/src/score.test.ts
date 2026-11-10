import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { belowFloor, type MutationReport, mutationFloors, scoreOf, summaryTable } from "./score.ts";

function report(...statuses: string[]): MutationReport {
  return { files: { "src/a.ts": { mutants: statuses.map((status) => ({ status })) } } };
}

verifies("mutation.score-per-package", () => {
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
      "| yaml | 80.0% | none | 4 | 1 | 0 | 0 |",
      "| schema-kit | no mutants | none | 0 | 0 | 0 | 1 |",
      "| workflow | no code yet | | | | | |",
      "| routines | failed: Stryker exited with 1 | | | | | |",
    ]);
  });
});

verifies("mutation.floor-per-package", () => {
  test("floors core/yaml at 85", () => {
    expect(mutationFloors["packages/core/yaml"]).toBe(85);
  });

  test("floors core/schema-kit at 98", () => {
    expect(mutationFloors["packages/core/schema-kit"]).toBe(98);
  });

  test("is under the floor when the score is lower", () => {
    expect(
      belowFloor(scoreOf(report(...Array(84).fill("Killed"), ...Array(16).fill("Survived"))), 85),
    ).toBe(true);
  });

  test("is not under the floor when the score meets it", () => {
    expect(
      belowFloor(scoreOf(report(...Array(85).fill("Killed"), ...Array(15).fill("Survived"))), 85),
    ).toBe(false);
  });

  test("is under the floor when there was nothing to score", () => {
    expect(belowFloor(scoreOf({ files: {} }), 85)).toBe(true);
  });

  test("never fails a package without a floor", () => {
    expect(belowFloor(scoreOf(report("Survived")), undefined)).toBe(false);
  });

  test("marks a package under its floor in the job summary", () => {
    const table = summaryTable([
      { name: "yaml", kind: "scored", score: scoreOf(report("Killed", "Survived")), floor: 85 },
    ]);
    expect(table).toContain("| yaml | 50.0% (under the floor) | 85% | 1 | 1 | 0 | 0 |");
  });
});
