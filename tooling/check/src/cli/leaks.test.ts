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
    writeFileSync(lenient, "absolute-path setup.md example path in a how-to\n");
    expect(run({}, "--allow-file", lenient).code).toBe(0);

    const trusted = join(repo, "trusted.txt");
    writeFileSync(trusted, "# nothing is allowed\n");
    expect(run({}, "--allow-file", trusted).code).toBe(1);
  });
});
