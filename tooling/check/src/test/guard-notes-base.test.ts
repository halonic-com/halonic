import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";

const workflow = readFileSync(
  new URL("../../../../.github/workflows/guard-notes.yml", import.meta.url),
  "utf8",
);

/** The `on:` block of guard-notes.yml, up to the next top-level key. */
function triggers(): string {
  const start = workflow.indexOf("\non:\n");
  const end = workflow.indexOf("\npermissions:", start);
  expect(start).toBeGreaterThan(-1);
  return workflow.slice(start, end);
}

/** The shell of the "Base is main or a release branch" step, as written in the workflow. */
function baseStep(): string {
  const start = workflow.indexOf("name: Base is main or a release branch");
  const run = workflow.indexOf("run: |\n", start);
  const end = workflow.indexOf("\n      - ", run);
  expect(start).toBeGreaterThan(-1);
  return workflow
    .slice(run + "run: |\n".length, end)
    .split("\n")
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n");
}

/** Runs the step with a base ref, as a pull request or a merge group passes it. */
function runBaseStep(baseRef: string) {
  return spawnSync("bash", ["-e", "-c", baseStep()], {
    env: { PATH: process.env.PATH, BASE_REF: baseRef },
    encoding: "utf8",
  });
}

verifies("check.guard-notes-base", () => {
  test("the note check runs again on every edit, for pull requests into main or a release branch", () => {
    const on = triggers();
    expect(on).toMatch(/pull_request_target:\n {4}types: \[opened, synchronize, reopened, edited\]\n/);
    expect(on).toMatch(/\n {4}branches: \[main, "release\/\*\*"\]\n/);
    // The job runs in full on every edit, not only on a base change.
    expect(workflow).not.toMatch(/^ {4}if: /m);
  });

  test("the first step passes for main and release branches", () => {
    for (const ref of ["main", "release/0.1", "refs/heads/main", "refs/heads/release/0.1"]) {
      const result = runBaseStep(ref);
      expect(result.status, `${ref}: ${result.stdout}`).toBe(0);
    }
  });

  test("the first step fails for any other base", () => {
    for (const ref of ["feature/x", "mainline", "refs/heads/release", "my-release/1", ""]) {
      const result = runBaseStep(ref);
      expect(result.status, ref).toBe(1);
      expect(result.stdout).toContain("Change the pull request's base.");
    }
  });
});
