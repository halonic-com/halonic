import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Each test starts real git and Node.js processes; give them room on a loaded runner.
vi.setConfig({ testTimeout: 60_000 });

const script = resolve(import.meta.dirname, "install-hooks.ts");
const oldHooksPath = "tooling/check/hooks";

let repo = "";
let installedPath = "";

function readHooksPath(): string {
  // An unset key exits 1, which is the answer here, not a failure.
  return runGit("config", "--local", "core.hooksPath").stdout.trim();
}

function git(...args: string[]): string {
  const result = runGit(...args);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} exited ${result.status}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function runGit(...args: string[]): { status: number | null; stdout: string; stderr: string } {
  return spawnSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: join(repo, "no-global-config"),
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
  });
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
  repo = realpathSync(mkdtempSync(join(tmpdir(), "install-hooks-")));
  installedPath = join(repo, ".git", "halonic-hooks");
  git("init", "-q", "-b", "main");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("install-hooks", () => {
  it("copies the hooks under the git dir and points git at them", () => {
    const result = install();
    expect(result.status).toBe(0);
    expect(readHooksPath()).toBe(installedPath);
    expect(readdirSync(installedPath).sort()).toEqual([
      "pre-commit",
      "pre-push",
      "run-leak-guard.sh",
    ]);
    if (process.platform !== "win32") {
      expect(statSync(join(installedPath, "pre-commit")).mode & 0o111).toBe(0o111);
    }
    expect(result.output).toContain("git hooks installed");
  });

  it("copies the hooks afresh on every install, quietly once installed", () => {
    install();
    writeFileSync(join(installedPath, "pre-commit"), "stale\n");
    writeFileSync(join(installedPath, "post-merge"), "stale\n");
    expect(install().output).toBe("");
    expect(readdirSync(installedPath)).not.toContain("post-merge");
    expect(statSync(join(installedPath, "pre-commit")).size).toBeGreaterThan("stale\n".length);
  });

  it("never runs a hook a checked-out branch brings along", () => {
    install();
    // `main` needs a commit to switch back to.
    git("commit", "-q", "--no-verify", "--allow-empty", "-m", "start");
    git("switch", "-q", "-c", "brings-a-hook");
    const hook = join(repo, oldHooksPath, "post-checkout");
    mkdirSync(join(repo, oldHooksPath), { recursive: true });
    writeFileSync(hook, `#!/bin/sh\ntouch "$(git rev-parse --show-toplevel)/marker"\n`);
    chmodSync(hook, 0o755);
    git("add", oldHooksPath);
    // The installed pre-commit hook needs the guard's code, which this throwaway repo doesn't have.
    git("commit", "-q", "--no-verify", "-m", "add a hook");
    git("switch", "-q", "main");
    git("switch", "-q", "brings-a-hook");
    expect(existsSync(hook)).toBe(true);
    expect(existsSync(join(repo, "marker"))).toBe(false);

    // The same checkout with the old in-tree hooks path does run it, so the check above means something.
    git("config", "--local", "core.hooksPath", oldHooksPath);
    git("switch", "-q", "main");
    git("switch", "-q", "brings-a-hook");
    expect(existsSync(join(repo, "marker"))).toBe(true);
  });

  it.each([
    ["relative", oldHooksPath],
    ["absolute", () => join(repo, oldHooksPath)],
  ])("replaces the %s in-tree hooks path an older install set", (_kind, value) => {
    git("config", "--local", "core.hooksPath", typeof value === "string" ? value : value());
    const result = install();
    expect(result.status).toBe(0);
    expect(readHooksPath()).toBe(installedPath);
    expect(result.output).toContain("git hooks installed");
  });

  it("never replaces a hooks path someone else set, and says how to opt in", () => {
    git("config", "--local", "core.hooksPath", ".husky");
    const result = install();
    expect(result.status).toBe(0);
    expect(readHooksPath()).toBe(".husky");
    expect(existsSync(installedPath)).toBe(false);
    expect(result.output).toContain("NOT installed");
    expect(result.output).toContain(".husky");
  });

  it("installs nothing in CI", () => {
    const result = install({ CI: "true" });
    expect(result.status).toBe(0);
    expect(readHooksPath()).toBe("");
    expect(existsSync(installedPath)).toBe(false);
  });
});
