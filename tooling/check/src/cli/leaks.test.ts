import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { absolute } from "../leaks/test-values.ts";

const script = join(import.meta.dirname, "leaks.ts");

let repo: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "leaks-cli-"));
  writeFileSync(join(repo, "notes.md"), "A harmless note.\n");
  execFileSync("git", ["init", "--quiet"], { cwd: repo });
  execFileSync("git", ["add", "."], { cwd: repo });
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

/** Runs the guard in the throwaway repo with only the variables given. */
function run(environment: Record<string, string>, ...args: string[]) {
  const result = spawnSync("node", [script, ...args], {
    cwd: repo,
    encoding: "utf8",
    // An empty HOME keeps a real local deny-terms file out of the test.
    env: {
      ...process.env,
      HOME: repo,
      HALONIC_DENY_TERMS: "",
      HALONIC_DENY_TERMS_FILE: "",
      HALONIC_TERMS_REQUIRED: "",
      GITHUB_ACTIONS: "",
      ...environment,
    },
  });
  return { code: result.status, output: result.stdout + result.stderr };
}

function writeAndStage(name: string, text: string): void {
  writeFileSync(join(repo, name), text);
  execFileSync("git", ["add", "."], { cwd: repo });
}

describe("leak guard command", () => {
  it("skips the personal terms with a notice when nothing is configured", () => {
    const result = run({});
    expect(result.code).toBe(0);
    expect(result.output).toContain("personal terms were not checked");
  });

  it("fails instead of skipping when the list is required", () => {
    const result = run({ HALONIC_TERMS_REQUIRED: "true" });
    expect(result.code).toBe(1);
    expect(result.output).toContain("HALONIC_TERMS_REQUIRED is true");
  });

  it("still skips when the requirement is explicitly off", () => {
    expect(run({ HALONIC_TERMS_REQUIRED: "false" }).code).toBe(0);
  });

  it("fails when the secret is set but holds no term", () => {
    const result = run({ HALONIC_DENY_TERMS: "# only a comment\n, ,\n" });
    expect(result.code).toBe(1);
    expect(result.output).toContain("holds no usable term");
  });

  it("finds a term, also written with look-alike characters, and never prints it", () => {
    writeAndStage("notes.md", "see the Blue%20Whale\n");
    const result = run({ HALONIC_DENY_TERMS: "blue whale" });
    expect(result.code).toBe(1);
    expect(result.output).toContain("notes.md:1");
    expect(result.output.toLowerCase()).not.toContain("whale");
  });

  it("asks GitHub to mask every term, once per line of the list", () => {
    const result = run({ GITHUB_ACTIONS: "true", HALONIC_DENY_TERMS: "zebra\n50%\nblue whale" });
    expect(result.output).toContain("::add-mask::zebra\n");
    expect(result.output).toContain("::add-mask::50%25\n");
    expect(result.output).toContain("::add-mask::blue whale\n");
  });

  it("reads the allowed phrases from the file it is given, not the repo's copy", () => {
    writeAndStage("notes.md", "a zebra-crossing sign\n");
    const environment = { HALONIC_DENY_TERMS: "zebra" };
    const lenient = join(repo, "lenient.txt");
    writeFileSync(lenient, "zebra-crossing\n");
    expect(run(environment, "--allowed-phrases", lenient).code).toBe(0);

    const trusted = join(repo, "trusted.txt");
    writeFileSync(trusted, "# nothing is allowed\n");
    expect(run(environment, "--allowed-phrases", trusted).code).toBe(1);
  });

  it("ignores an allowed phrase that is a term itself, so it can't silence the term", () => {
    writeAndStage("notes.md", "see the crossing-sign\n");
    const phrases = join(repo, "phrases.txt");
    writeFileSync(phrases, "Crossing-sign\n");
    const result = run({ HALONIC_DENY_TERMS: "crossing-sign" }, "--allowed-phrases", phrases);
    expect(result.code).toBe(1);
    expect(result.output.toLowerCase()).not.toContain("crossing-sign");
  });

  it("reads the allow list from the file it is given, not the repo's copy", () => {
    writeAndStage("setup.md", `run it from ${absolute("Users", "someone", "code")}\n`);
    expect(run({}).code).toBe(1);

    const lenient = join(repo, "lenient.txt");
    writeFileSync(lenient, "absolute-path setup.md root:/Users/ example path in a how-to\n");
    expect(run({}, "--allow-file", lenient).code).toBe(0);

    const trusted = join(repo, "trusted.txt");
    writeFileSync(trusted, "# nothing is allowed\n");
    expect(run({}, "--allow-file", trusted).code).toBe(1);
  });

  it("passes a later-added term in --all only in commits from before its cutoff", () => {
    // Writes the commit object itself: a git wrapper may drop GIT_COMMITTER_DATE.
    const commitAt = (date: string, message: string) => {
      const git = (args: string[], input?: string) =>
        execFileSync("git", args, { cwd: repo, encoding: "utf8", input }).trim();
      const tree = git(["write-tree"]);
      const parent = spawnSync("git", ["rev-parse", "--verify", "--quiet", "HEAD"], {
        cwd: repo,
        encoding: "utf8",
      }).stdout.trim();
      const identity = `t <t@example.com> ${Date.parse(date) / 1000} +0000`;
      const parentLine = parent === "" ? "" : `parent ${parent}\n`;
      const body = `tree ${tree}\n${parentLine}author ${identity}\ncommitter ${identity}\n\n${message}\n`;
      git(["update-ref", "HEAD", git(["hash-object", "-t", "commit", "-w", "--stdin"], body)]);
    };
    writeAndStage("notes.md", "the walrus was here\n");
    commitAt("2026-11-20T10:00:00Z", "docs: an old note");
    const allowFile = join(repo, "allow.txt");
    const cutoff = "term-cutoff entry:2 before:2026-11-21T00:00Z added later, history kept\n";
    writeFileSync(allowFile, cutoff);
    // The working tree is checked against every term, so the term leaves it first.
    writeAndStage("notes.md", "A harmless note.\n");
    commitAt("2026-11-22T10:00:00Z", "docs: reword the note");
    const terms = { HALONIC_DENY_TERMS: "zebra\nwalrus" };

    const old = run(terms, "--all", "--allow-file", allowFile);
    expect(old.output).toContain("terms 2 pass in commits before their cutoff");
    expect(old.code).toBe(0);
    expect(run(terms, "--all").code).toBe(1);
    expect(
      run({ HALONIC_DENY_TERMS: "walrus\nzebra" }, "--all", "--allow-file", allowFile).code,
    ).toBe(1);

    writeAndStage("notes.md", "the walrus is back\n");
    commitAt("2026-11-22T11:00:00Z", "docs: a new note");
    expect(run(terms, "--all", "--allow-file", allowFile).code).toBe(1);
  });

  it("fails --all when a cutoff names a term past the end of the list", () => {
    const allowFile = join(repo, "allow.txt");
    writeFileSync(
      allowFile,
      "term-cutoff entry:3 before:2026-11-21T00:00Z added later, history kept\n",
    );
    const result = run({ HALONIC_DENY_TERMS: "zebra\nwalrus" }, "--all", "--allow-file", allowFile);
    expect(result.code).toBe(1);
    expect(result.output).toContain("names term 3, but the list has 2");
  });

  it("fails @<agent name> in a pull request's commits and body, but not in --all", () => {
    execFileSync(
      "git",
      [
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@example.com",
        "commit",
        "--quiet",
        "-m",
        "chore: start",
      ],
      { cwd: repo },
    );
    writeAndStage("notes.md", "A second note.\n");
    const message = "docs: a second note\n\nThanks @Julian";
    execFileSync(
      "git",
      ["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "--quiet", "-m", message],
      { cwd: repo },
    );
    const event = join(repo, "event.json");
    writeFileSync(
      event,
      JSON.stringify({ pull_request: { title: "docs: a note", body: "Ask @liam." } }),
    );

    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    const base = execFileSync("git", ["rev-parse", "HEAD^"], {
      cwd: repo,
      encoding: "utf8",
    }).trim();
    const result = run({ GITHUB_EVENT_PATH: event }, "--range", `${base}..${head}`);
    expect(result.code).toBe(1);
    expect(result.output).toContain("commit message [agent-mention] Contains @Julian");
    expect(result.output).toContain("pull request body [agent-mention] Contains @liam");
    expect(run({}, "--all").code).toBe(0);
  });

  // The merge queue's squash commit is authored by whoever opened the pull
  // request, and the queue checks commit authors (HAL-18475).
  it("fails a term in the login or name of the pull request's opener, and never prints it", () => {
    const commit = (message: string) =>
      execFileSync(
        "git",
        ["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "--quiet", "-m", message],
        { cwd: repo },
      );
    commit("chore: start");
    writeAndStage("notes.md", "A second note.\n");
    commit("docs: a second note");
    const range = `${execFileSync("git", ["rev-parse", "HEAD^"], { cwd: repo, encoding: "utf8" }).trim()}..HEAD`;
    const eventFor = (user: Record<string, string>) => {
      const event = join(repo, "event.json");
      writeFileSync(event, JSON.stringify({ pull_request: { title: "docs: a note", user } }));
      return event;
    };
    const terms = { HALONIC_DENY_TERMS: "walrus" };

    const byLogin = run(
      { ...terms, GITHUB_EVENT_PATH: eventFor({ login: "walrus-dev" }) },
      "--range",
      range,
    );
    expect(byLogin.code).toBe(1);
    expect(byLogin.output).toContain("pull request author [personal-term]");
    expect(byLogin.output.toLowerCase()).not.toContain("walrus");

    const byName = run(
      { ...terms, GITHUB_EVENT_PATH: eventFor({ login: "someone", name: "Walrus" }) },
      "--range",
      range,
    );
    expect(byName.code).toBe(1);
    expect(byName.output).toContain("pull request author [personal-term]");

    expect(
      run({ ...terms, GITHUB_EVENT_PATH: eventFor({ login: "someone" }) }, "--range", range).code,
    ).toBe(0);
  });
});
