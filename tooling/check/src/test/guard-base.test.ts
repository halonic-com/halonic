import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, expect, test } from "vitest";
import { requirementText, runGuard } from "./guard-fixture.ts";

const workflow = readFileSync(
  join(import.meta.dirname, "../../../../.github/workflows/ci.yml"),
  "utf8",
);

/** The shell of base-tests' "Switch to the merge base" step, as written in ci.yml. */
function switchStep(): string {
  const start = workflow.indexOf("name: Switch to the merge base before anything runs");
  const run = workflow.indexOf("run: |\n", start);
  const end = workflow.indexOf('echo "sha=$sha"', run);
  expect(start).toBeGreaterThan(-1);
  return workflow
    .slice(run + "run: |\n".length, end)
    .split("\n")
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n");
}

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const name = "requirements/timer-fires.md";
const requirementFile = `packages/core/workflow/${name}`;
const original = requirementText("timer-fires");
const changedOnMain = requirementText("timer-fires", "active", "The engine shall fire the timer.");

/** main (A), a branch off A that changes another file, main moving on to B, and the merge ref. */
function pullRequest() {
  const root = mkdtempSync(join(tmpdir(), "guard-base-"));
  roots.push(root);
  const git = (...args: string[]): string =>
    execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  const write = (file: string, text: string): void => {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  const commit = (message: string): string => {
    git("add", ".");
    git("commit", "--quiet", "--no-verify", "-m", message);
    return git("rev-parse", "HEAD");
  };
  git("init", "--quiet", "-b", "main");
  write(requirementFile, original);
  const a = commit("A");
  git("switch", "--quiet", "-c", "branch");
  write("README.md", "the pull request\n");
  commit("P");
  git("switch", "--quiet", "main");
  write(requirementFile, changedOnMain);
  const b = commit("B");
  git("switch", "--quiet", "--detach", "main");
  git("merge", "--quiet", "--no-ff", "-m", "merge ref", "branch");
  const run = (base: string): string => {
    const output = join(root, "..", `${root.split("/").pop()}-out`);
    const script = `BASE=${base}\n${switchStep()}\necho "$sha" > ${output}\n`;
    execFileSync("bash", ["-e", "-c", script], { cwd: root });
    const sha = readFileSync(output, "utf8").trim();
    rmSync(output);
    return sha;
  };
  return { a, b, run };
}

verifies("check.guard-base-is-built-on-commit", () => {
  test("the base side is the main commit the merge ref was built on, not the older base sha", () => {
    const { a, b, run } = pullRequest();
    expect(run(a)).toBe(b);
  });

  test("the guard reports nothing when main moved on after the branch point", async () => {
    const { errors } = await runGuard({
      base: { [name]: changedOnMain },
      head: { [name]: changedOnMain },
    });
    expect(errors).toEqual([]);
  });

  test("the older base would have reported the requirement main changed", async () => {
    const { errors } = await runGuard({
      base: { [name]: original },
      head: { [name]: changedOnMain },
    });
    expect(errors.join("\n")).toMatch(/"workflow.timer-fires" was edited/);
  });
});
