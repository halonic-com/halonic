import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Neutral stand-in term: the real list never enters the repo.
const term = "zebra";
const command = join(import.meta.dirname, "terms.ts");

let root = "";

function write(file: string, text: string): void {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}

function commit(message: string, author = "Someone <someone@example.com>"): void {
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-q", "--allow-empty", "-m", message, `--author=${author}`], {
    cwd: root,
  });
}

/** Runs the guard in the fixture repo, away from any real list or Actions setting. */
function guard(
  args: readonly string[],
  options: { terms?: string; event?: unknown } = {},
): { status: number; output: string } {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: root };
  for (const name of ["HALONIC_DENY_TERMS", "GITHUB_ACTIONS", "GITHUB_EVENT_PATH"]) {
    delete env[name];
  }
  if (options.terms !== undefined) {
    env["HALONIC_DENY_TERMS"] = options.terms;
  }
  if (options.event !== undefined) {
    writeFileSync(join(root, "..", `${process.pid}-event.json`), JSON.stringify(options.event));
    env["GITHUB_EVENT_PATH"] = join(root, "..", `${process.pid}-event.json`);
  }
  const result = spawnSync(process.execPath, [command, ...args], {
    cwd: root,
    env,
    encoding: "utf8",
  });
  return { status: result.status ?? -1, output: `${result.stdout}${result.stderr}` };
}

beforeEach(() => {
  root = join(mkdtempSync(join(tmpdir(), "halonic-terms-")), "repo");
  mkdirSync(root);
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.name", "CI"], { cwd: root });
  execFileSync("git", ["config", "user.email", "ci@example.com"], { cwd: root });
  write("pnpm-workspace.yaml", "packages:\n  - tooling/*\n");
  write("README.md", "Clean.\n");
  commit("chore: start");
});

afterEach(() => {
  rmSync(dirname(root), { recursive: true, force: true });
});

describe("pnpm check:terms", { timeout: 30_000 }, () => {
  it("skips loudly without a list, and says why on fork and Dependabot pull requests", () => {
    expect(guard([])).toMatchObject({ status: 0, output: expect.stringContaining("not set yet") });
    const pullRequest = (login: string, head: string) => ({
      pull_request: {
        title: "t",
        user: { login },
        head: { ref: "b", repo: { full_name: head } },
        base: { repo: { full_name: "halonic-com/halonic" } },
      },
    });
    expect(guard([], { event: pullRequest("someone", "someone/halonic") }).output).toContain(
      "pull requests from forks",
    );
    expect(
      guard([], { event: pullRequest("dependabot[bot]", "halonic-com/halonic") }).output,
    ).toContain("Dependabot's pull requests");
  });

  it("finds the term in the working tree and never prints it", () => {
    write("docs/notes.md", "fine\nsome Zebra2Notes here\n");
    const result = guard([], { terms: term });
    expect(result.status).toBe(1);
    expect(result.output).toContain("docs/notes.md:2");
    expect(result.output.toLowerCase()).not.toContain(term);
  });

  it("scans the files, commits, authors and pull request text of a range", () => {
    const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
    write("a.ts", `export const ${term}Count = 1;\n`);
    commit(`feat: add the ${term} counter`, `${term} <x@example.com>`);
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
    const range = `${base.trim()}..${head.trim()}`;
    const event = { pull_request: { title: `fix ${term}`, body: "", head: { ref: "b" } } };
    const result = guard(["--range", range], { terms: term, event });
    expect(result.status).toBe(1);
    expect(result.output).toContain("a.ts:1");
    expect(result.output).toContain("The author or committer");
    expect(result.output).toContain("The commit message");
    expect(result.output).toContain("The pull request title");
    expect(result.output.toLowerCase()).not.toContain(term);
  });

  it("reads each commit whole, whatever bytes its message holds", () => {
    // The old record separator (U+001E) inside a message used to start a
    // new "commit" whose hash was the next line: here, the term itself.
    commit(`chore: odd\u001e\n${term}`);
    const result = guard(["--all"], { terms: term });
    expect(result.output).toContain("The commit message");
    expect(result.output.toLowerCase()).not.toContain(term);
  });

  it("--all finds the term in files and file names that only history still has", () => {
    write("docs/old.md", `line one\nthe ${term} line\n`);
    write(`docs/${term}-notes/plan.md`, "harmless\n");
    commit("docs: add notes");
    rmSync(join(root, "docs"), { recursive: true });
    commit("docs: remove notes");
    expect(guard([], { terms: term }).status).toBe(0);
    const result = guard(["--all"], { terms: term });
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/history: docs\/old\.md \(blob [0-9a-f]{10}\):2/);
    expect(result.output).toContain("history: docs/[withheld]");
    expect(result.output.toLowerCase()).not.toContain(term);
  });

  it("--all doesn't report today's files twice", () => {
    write("docs/now.md", `the ${term} line\n`);
    commit("docs: add");
    const result = guard(["--all"], { terms: term });
    expect(result.output.match(/docs\/now\.md/g)).toHaveLength(1);
  });
});
