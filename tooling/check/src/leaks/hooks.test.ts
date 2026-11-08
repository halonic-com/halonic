import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { absolute, fakeSecrets, testTerms } from "./test-values.ts";

/**
 * End to end: the real hooks in a throwaway repo. Each test makes a
 * commit or a push and checks that the hook lets it through or refuses
 * it, and that a personal term never shows up in what the hook prints.
 */

const hooksPath = resolve(import.meta.dirname, "../../hooks");
const [term = ""] = testTerms;

let scratch = "";
let repo = "";
let environment: NodeJS.ProcessEnv = {};

function run(command: string, args: readonly string[]): { status: number; output: string } {
  const result = spawnSync(command, args, { cwd: repo, env: environment, encoding: "utf8" });
  return { status: result.status ?? 1, output: `${result.stdout}${result.stderr}` };
}

function commitFile(
  path: string,
  content: string,
  ...extra: string[]
): { status: number; output: string } {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), content);
  run("git", ["add", path]);
  return run("git", ["commit", "-q", "-m", "test change", ...extra]);
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "leak-guard-"));
  repo = join(scratch, "repo");
  const termsFile = join(scratch, "deny-terms");
  writeFileSync(termsFile, testTerms.join("\n"));
  const { CI, GITHUB_ACTIONS, HALONIC_DENY_TERMS, ...rest } = process.env;
  environment = {
    ...rest,
    PATH: `${dirname(process.execPath)}${delimiter}${process.env["PATH"] ?? ""}`,
    HALONIC_DENY_TERMS_FILE: termsFile,
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.com",
    GIT_CONFIG_GLOBAL: join(scratch, "gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
  };
  mkdirSync(repo);
  run("git", ["init", "-q", "-b", "main"]);
  run("git", ["config", "core.hooksPath", hooksPath]);
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("pre-commit hook", () => {
  it("lets a clean commit through", () => {
    const result = commitFile("docs/readme.md", "Temporary files go to /tmp by default.\n");
    expect(result.output).toContain("leak guard: clean (with 2 personal terms");
    expect(result.status).toBe(0);
  });

  const refused: [string, string, string][] = [
    ["a fake key", "src/config.ts", `export const token = "${fakeSecrets["npm-token"]}";\n`],
    ["a private key block", "deploy/key.txt", `${fakeSecrets["private-key"]}\n`],
    ["a .env file", "apps/studio/.env", "PORT=3000\n"],
    [
      "an absolute local path",
      "docs/setup.md",
      `Clone into ${absolute("Users", "someone", "code")}.\n`,
    ],
    ["a personal term", "docs/thanks.md", `Thanks to ${term.toLowerCase()}!\n`],
  ];
  for (const [what, path, content] of refused) {
    it(`refuses a commit with ${what}`, () => {
      const result = commitFile(path, content);
      expect(result.status).not.toBe(0);
      expect(result.output).toContain("problem(s) found");
      expect(result.output.toLowerCase()).not.toContain(term.toLowerCase());
      expect(run("git", ["rev-list", "--all"]).output).toBe("");
    });
  }

  it("carries on without terms when there is no terms file, with a one-line notice", () => {
    environment["HALONIC_DENY_TERMS_FILE"] = join(scratch, "missing");
    const result = commitFile("docs/thanks.md", `Thanks to ${term}!\n`);
    expect(result.status).toBe(0);
    expect(result.output).toContain("personal terms were not checked");
  });
});

describe("pre-commit hook without a usable Node.js", () => {
  it("says the Node.js on PATH is too old, and refuses the commit", () => {
    const bin = join(scratch, "bin");
    mkdirSync(bin);
    // A Node.js stand-in that fails the version check and passes everything else on.
    writeFileSync(
      join(bin, "node"),
      `#!/bin/sh\ncase "$2" in *versions.node*) exit 1;; esac\nexec "${process.execPath}" "$@"\n`,
    );
    chmodSync(join(bin, "node"), 0o755);
    environment["PATH"] = `${bin}${delimiter}${environment["PATH"] ?? ""}`;
    const result = commitFile("docs/readme.md", "hello\n");
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Node.js on PATH is too old");
  });
});

describe("pre-push hook", () => {
  beforeEach(() => {
    run("git", ["init", "-q", "--bare", join(scratch, "remote.git")]);
    run("git", ["remote", "add", "origin", join(scratch, "remote.git")]);
    commitFile("README.md", "hello\n");
  });

  it("lets a clean push through", () => {
    const result = run("git", ["push", "-q", "origin", "main"]);
    expect(result.status).toBe(0);
  });

  it("refuses a push with a key that skipped the commit hook", () => {
    commitFile("src/a.ts", `const key = "${fakeSecrets["aws-access-key"]}";\n`, "--no-verify");
    const result = run("git", ["push", "-q", "origin", "main"]);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("[aws-access-key]");
    expect(result.output).not.toContain(fakeSecrets["aws-access-key"]);
  });

  it("refuses a push to a branch whose name holds a term, without showing it", () => {
    const result = run("git", ["push", "-q", "origin", `main:fix/${term.toLowerCase()}`]);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("pushed ref name [personal-term]");
    expect(result.output.toLowerCase()).not.toContain(term.toLowerCase());
  });

  it("refuses a push with a term in a commit message, without showing it", () => {
    run("git", ["push", "-q", "origin", "main"]);
    commitFile("docs/b.md", "fine\n", "-m", `credit ${term.toUpperCase()}`);
    const result = run("git", ["push", "-q", "origin", "main"]);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("commit message [personal-term]");
    expect(result.output.toLowerCase()).not.toContain(term.toLowerCase());
  });
});

describe("history scan (--all)", () => {
  const leaks = resolve(import.meta.dirname, "../cli/leaks.ts");

  beforeEach(() => {
    commitFile("README.md", "hello\n");
  });

  it("finds what a merge commit adds that neither side had", () => {
    run("git", ["switch", "-q", "-c", "side"]);
    commitFile("side.md", "side\n");
    run("git", ["switch", "-q", "main"]);
    commitFile("main.md", "main\n");
    run("git", ["merge", "-q", "--no-commit", "side"]);
    writeFileSync(join(repo, "merge.md"), `${absolute("home", "someone", "x")}\n`);
    run("git", ["add", "merge.md"]);
    run("git", ["commit", "-q", "--no-verify", "-m", "merge side"]);
    run("git", ["rm", "-q", "merge.md"]);
    run("git", ["commit", "-q", "-m", "remove it again"]);
    const result = run(process.execPath, [leaks, "--all"]);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("merge.md:1 [absolute-path]");
  });

  it("finds a term in a tag message, a tagger or a tag name, without showing it", () => {
    run("git", ["tag", "-a", "v1", "-m", `thanks ${term}`]);
    run("git", ["tag", `old-${term.toLowerCase()}`]);
    const result = run(process.execPath, [leaks, "--all"]);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("tag message [personal-term]");
    expect(result.output).toContain("ref name [personal-term]");
    expect(result.output.toLowerCase()).not.toContain(term.toLowerCase());
  });
});
