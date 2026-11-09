import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * The gitleaks action fails when it scanned 0 commits. gitleaks skips
 * pnpm-lock.yaml, so a lockfile-only commit also reports 0. These tests run
 * the real decision script in a throwaway repo and check that this case
 * passes while a git that refuses the repository still fails.
 */

const script = resolve(import.meta.dirname, "../../../../.github/actions/gitleaks/check-scanned.sh");

let scratch = "";
let repo = "";
let env: NodeJS.ProcessEnv = {};

function git(...args: string[]): void {
  const result = spawnSync("git", args, { cwd: repo, env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
}

function commit(path: string): void {
  writeFileSync(join(repo, path), `${Math.random()}\n`);
  git("add", path);
  git("commit", "-q", "-m", "change");
}

function decide(log: string, containerGit: string, logOpts: string): number {
  const logFile = join(scratch, "gitleaks.log");
  writeFileSync(logFile, log);
  const result = spawnSync("bash", [script], {
    cwd: repo,
    env: { ...env, LOG: logFile, STATUS: "0", LOG_OPTS: logOpts, CONTAINER_GIT: containerGit },
    encoding: "utf8",
  });
  return result.status ?? 1;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "gitleaks-action-"));
  repo = join(scratch, "repo");
  mkdirSync(repo);
  env = {
    ...process.env,
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.com",
    GIT_CONFIG_GLOBAL: join(scratch, "gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
  };
  git("init", "-q", "-b", "main");
  commit("README.md");
  git("tag", "base");
  commit("pnpm-lock.yaml");
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("gitleaks action: empty scans", () => {
  const none = "1 commits\n0 commits scanned.\nno leaks found";

  it("passes a lockfile-only commit that gitleaks skipped", () => {
    expect(decide(none, "git", "base..HEAD")).toBe(0);
  });

  it("fails when git in the container refuses the repository", () => {
    expect(decide(none, "false", "base..HEAD")).toBe(1);
  });

  it("fails when the range is empty", () => {
    expect(decide(none, "git", "HEAD..HEAD")).toBe(1);
  });

  it("passes through the status when commits were scanned", () => {
    expect(decide("1 commits scanned.", "false", "base..HEAD")).toBe(0);
  });
});
