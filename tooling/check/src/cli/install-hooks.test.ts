import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = resolve(import.meta.dirname, "install-hooks.ts");
const hooksPath = "tooling/check/hooks";

let repo = "";

function git(...args: string[]): string {
  const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  return result.stdout.trim();
}

function install(extra: NodeJS.ProcessEnv = {}): { status: number; output: string } {
  const { CI, ...rest } = process.env;
  const result = spawnSync(process.execPath, [script], {
    cwd: repo,
    env: { ...rest, GIT_CONFIG_GLOBAL: join(repo, "no-global-config"), ...extra },
    encoding: "utf8",
  });
  return { status: result.status ?? 1, output: `${result.stdout}${result.stderr}` };
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "install-hooks-"));
  git("init", "-q");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("install-hooks", () => {
  it("points a fresh clone at the repo's hooks", () => {
    const result = install();
    expect(result.status).toBe(0);
    expect(git("config", "--local", "core.hooksPath")).toBe(hooksPath);
    expect(result.output).toContain("git hooks installed");
  });

  it("does nothing when the hooks are already installed", () => {
    git("config", "--local", "core.hooksPath", hooksPath);
    expect(install().output).toBe("");
  });

  it("never replaces a hooks path someone else set, and says how to opt in", () => {
    git("config", "--local", "core.hooksPath", ".husky");
    const result = install();
    expect(result.status).toBe(0);
    expect(git("config", "--local", "core.hooksPath")).toBe(".husky");
    expect(result.output).toContain("NOT installed");
    expect(result.output).toContain(".husky");
  });

  it("installs nothing in CI", () => {
    const result = install({ CI: "true" });
    expect(result.status).toBe(0);
    expect(git("config", "--local", "core.hooksPath")).toBe("");
  });
});
