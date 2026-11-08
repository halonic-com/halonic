import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { checkDco } from "../rules/dco.ts";
import type { CheckContext } from "./context.ts";
import { type CommitFacts, coveredAccounts, dcoProblem, readCommits, signOffEmail } from "./dco.ts";
import { findRepoRoot } from "./workspace.ts";

const halonicDev = "353861737+halonic-dev@users.noreply.github.com";

function commit(overrides: Partial<CommitFacts>): CommitFacts {
  return {
    hash: "0123456789abcdef",
    subject: "fix(yaml): keep the line number",
    authorName: "Ada",
    authorEmail: "ada@example.com",
    parentCount: 1,
    signOffs: [],
    ...overrides,
  };
}

describe("check.dco-sign-off: one commit", () => {
  test("passes when a sign-off names the author's address, in any case and under any name", () => {
    expect(dcoProblem(commit({ signOffs: ["Ada Lovelace <ADA@example.com>"] }))).toBeUndefined();
  });

  test("passes for the halonic-dev account signed off with its own noreply address", () => {
    const signed = commit({
      authorName: "halonic-dev",
      authorEmail: halonicDev,
      signOffs: [`halonic-dev <${halonicDev}>`],
    });
    expect(dcoProblem(signed)).toBeUndefined();
  });

  test("passes when one of several sign-offs is the author's", () => {
    const signed = commit({ signOffs: ["Bob <bob@example.com>", "Ada <ada@example.com>"] });
    expect(dcoProblem(signed)).toBeUndefined();
  });

  test("fails without a sign-off and says how to add one", () => {
    const problem = dcoProblem(commit({}));
    expect(problem).toContain('"fix(yaml): keep the line number" by Ada <ada@example.com>');
    expect(problem).toContain('has no "Signed-off-by:" line');
    expect(problem).toContain("git commit -s");
  });

  test("fails when the only sign-off is someone else's", () => {
    const problem = dcoProblem(commit({ signOffs: ["Bob <bob@example.com>"] }));
    expect(problem).toContain("signed off as Bob <bob@example.com>, not as its author");
  });

  test("fails when the halonic-dev account is signed off with another address", () => {
    const signed = commit({
      authorEmail: halonicDev,
      signOffs: ["halonic-dev <halonic-dev@users.noreply.github.com>"],
    });
    expect(dcoProblem(signed)).toContain("not as its author");
  });

  test("fails when the sign-off has no email address", () => {
    expect(dcoProblem(commit({ signOffs: ["Ada"] }))).toContain("not as its author");
  });

  test("passes an unsigned halonic-dev commit in a pull request halonic-dev opened", () => {
    const unsigned = commit({ authorName: "halonic-dev", authorEmail: halonicDev });
    expect(dcoProblem(unsigned, "halonic-dev")).toBeUndefined();
    expect(dcoProblem(unsigned, "Halonic-Dev")).toBeUndefined();
  });

  test("fails an unsigned halonic-dev commit in someone else's pull request, or with no opener", () => {
    const unsigned = commit({ authorName: "halonic-dev", authorEmail: halonicDev });
    expect(dcoProblem(unsigned, "someone")).toContain('has no "Signed-off-by:" line');
    expect(dcoProblem(unsigned)).toContain('has no "Signed-off-by:" line');
  });

  test("fails anyone else's unsigned commit in a pull request halonic-dev opened", () => {
    expect(dcoProblem(commit({}), "halonic-dev")).toContain('has no "Signed-off-by:" line');
  });

  test("skips merge commits", () => {
    expect(dcoProblem(commit({ parentCount: 2 }))).toBeUndefined();
  });

  test("reads the address from Name <email> only", () => {
    expect(signOffEmail("Ada Lovelace <ada@example.com>")).toBe("ada@example.com");
    expect(signOffEmail("  Ada <ada@example.com>  ")).toBe("ada@example.com");
    expect(signOffEmail("<ada@example.com>")).toBeUndefined();
    expect(signOffEmail("Ada ada@example.com")).toBeUndefined();
    expect(signOffEmail("Ada <not an address>")).toBeUndefined();
  });
});

describe("check.dco-sign-off: the standing statement", () => {
  test("lists exactly the accounts the check skips", () => {
    const statement = readFileSync(
      join(findRepoRoot(), "docs/legal/dco-standing-statement.md"),
      "utf8",
    );
    const listed = [...statement.matchAll(/^\| `([^`]+)` +\| `([^`]+)` +\|$/gm)].map(
      ([, login, email]) => ({ login, email }),
    );
    expect(listed).toEqual(coveredAccounts.map(({ login, email }) => ({ login, email })));
  });
});

describe("check.dco-sign-off: the commits of a real git range", () => {
  let root = "";
  let base = "";

  function git(args: readonly string[]): string {
    const config = [
      "-c",
      "commit.gpgsign=false",
      "-c",
      "user.name=CI",
      "-c",
      "user.email=ci@example.com",
    ];
    return execFileSync("git", [...config, ...args], { cwd: root, encoding: "utf8" }).trim();
  }

  // The author goes on the command line, so no git config or environment can replace it.
  function commitFile(file: string, message: string, author = "Ada <ada@example.com>"): void {
    writeFileSync(join(root, file), `${message}\n`);
    git(["add", file]);
    git(["commit", "-q", `--author=${author}`, "-m", message]);
  }

  function failingSubjects(range: string): string[] {
    return readCommits(root, range)
      .filter((facts) => dcoProblem(facts) !== undefined)
      .map((facts) => facts.subject);
  }

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "dco-"));
    git(["init", "-q", "-b", "main"]);
    commitFile("base.txt", "chore: base");
    base = git(["rev-parse", "HEAD"]);
    git(["checkout", "-q", "-b", "topic"]);
    commitFile("a.txt", "feat: signed\n\nSigned-off-by: Ada <ada@example.com>");
    commitFile(
      "b.txt",
      `feat: pushed through the GitHub connection\n\nSigned-off-by: halonic-dev <${halonicDev}>`,
      `halonic-dev <${halonicDev}>`,
    );
    commitFile("c.txt", "fix: not signed");
    commitFile(
      "d.txt",
      "fix: sign-off in the middle\n\nSigned-off-by: Ada <ada@example.com>\n\nMore text after it.",
    );
    git(["checkout", "-q", "main"]);
    commitFile("e.txt", "chore: meanwhile on main");
    git(["checkout", "-q", "topic"]);
    git(["merge", "-q", "--no-edit", "main"]);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("git parses the trailers: only the unsigned commit and the misplaced sign-off fail", () => {
    // Like a pull request: from the base branch's tip, so main's own commit is not checked.
    expect(failingSubjects("main..topic").sort()).toEqual([
      "fix: not signed",
      "fix: sign-off in the middle",
    ]);
  });

  test("the rule reports each failing commit by its short hash", () => {
    // The rule only reads the repo root from the context.
    const context = { root } as CheckContext;
    const problems = checkDco(context, "main..topic").problems;
    expect(problems.map((problem) => problem.rule)).toEqual(["dco", "dco"]);
    expect(problems.every((problem) => /^commit [0-9a-f]{10}$/.test(problem.file))).toBe(true);
  });

  test("passes a range whose commits are all signed off", () => {
    const signed = readCommits(root, `${base}..topic`).find(
      (facts) => facts.subject === "feat: signed",
    );
    const context = { root } as CheckContext;
    expect(checkDco(context, `${base}..${signed?.hash}`).problems).toEqual([]);
  });

  test("checks nothing without a range, and rejects a range that isn't BASE..HEAD", () => {
    const context = { root } as CheckContext;
    expect(checkDco(context, undefined).problems).toEqual([]);
    expect(checkDco(context, "main; rm -rf /").problems[0]?.message).toContain("BASE..HEAD");
    expect(checkDco(context, "--output=x..y").problems[0]?.message).toContain("BASE..HEAD");
    // topic~3 is the halonic-dev commit, signed off.
    expect(checkDco(context, "topic~4..topic~3").problems).toEqual([]);
  });

  test("passes the unsigned commits only for the account the statement covers", () => {
    git(["checkout", "-q", "-b", "agent", base]);
    commitFile("f.txt", "feat: agent work", `halonic-dev <${halonicDev}>`);
    const context = { root } as CheckContext;
    expect(checkDco(context, "main..agent", "halonic-dev").problems).toEqual([]);
    expect(checkDco(context, "main..agent", "someone").problems).toHaveLength(1);
    expect(checkDco(context, "main..agent", undefined).problems).toHaveLength(1);
  });
});
