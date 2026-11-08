import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const realRoot = join(import.meta.dirname, "..", "..", "..", "..");
const newCommand = join(realRoot, "tooling/discover/src/cli/new.ts");
const checkCommand = join(realRoot, "tooling/check/src/cli/check.ts");

let root = "";

/** Runs one of the repo's commands inside the copy, as `pnpm <name>` would. */
function run(script: string, args: readonly string[]): { status: number; output: string } {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" });
  return { status: result.status ?? -1, output: `${result.stdout}${result.stderr}` };
}

// A copy of the repo's tracked files, so `pnpm new` writes there and the real
// checks run on exactly what it wrote, with the real policy and app.
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "halonic-new-"));
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: realRoot, encoding: "utf8" });
  for (const file of files.split("\0").filter((name) => name !== "")) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    cpSync(join(realRoot, file), join(root, file));
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// Each test starts Node twice, which takes a few seconds on a busy runner.
describe("pnpm new", { timeout: 60_000 }, () => {
  it("refuses to guess the owner", () => {
    const result = run(newCommand, ["package", "core/ci-example"]);
    expect(result.status).toBe(2);
    expect(result.output).toContain("--owner <agent>");
  });

  it("creates a core package that passes every check", () => {
    expect(run(newCommand, ["package", "core/ci-example", "--owner", "ci"]).status).toBe(0);
    const policy = JSON.parse(readFileSync(join(root, "tooling/check/policy.json"), "utf8"));
    expect(policy.coreOrder).toContain("@halonicjs/ci-example");
    const check = run(checkCommand, []);
    expect(check.output).toContain("check: 0 error(s)");
    expect(check.status).toBe(0);
  });

  it("creates a feature, adds it to the app and passes every check", () => {
    expect(run(newCommand, ["feature", "ci-example", "--owner", "ci"]).status).toBe(0);
    const app = JSON.parse(readFileSync(join(root, "apps/studio/package.json"), "utf8"));
    expect(app.dependencies["@halonicjs/studio-feature-ci-example"]).toBe("workspace:*");
    const check = run(checkCommand, []);
    expect(check.output).toContain("check: 0 error(s)");
    expect(check.status).toBe(0);
  });
});
