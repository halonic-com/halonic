import { describe, expect, it } from "vitest";
import { loadContext } from "../lib/context.ts";
import { patchHash } from "../lib/patches.ts";
import type { Problem } from "../lib/problems.ts";
import { rules } from "../rules/all.ts";
import {
  type FixtureOptions,
  removeFixtureRepo,
  runChecks,
  writeFixtureRepo,
} from "./fixture-repo.ts";

// The real catalog pins srt to an exact version; the tests patch that one.
const srt = "@anthropic-ai/sandbox-runtime@0.0.81";
const file = "patches/@anthropic-ai__sandbox-runtime@0.0.81.patch";
const patchText = "diff --git a/dist/a.js b/dist/a.js\n-old\n+new\n";

function allowing(entry: Record<string, unknown> = {}): string {
  return JSON.stringify({
    allowed: [
      {
        package: srt,
        file,
        sha256: patchHash(patchText),
        reason: "Adds a setting the fence needs and srt lacks.",
        "remove-when": "srt has the setting itself",
        ...entry,
      },
    ],
  });
}

/** The real workspace file without its own `patchedDependencies:`, so each test sets its own. */
function withoutRealPatches(yaml: string): string {
  return yaml.replace(/^patchedDependencies:\n(?: {2}.*\n)*/m, "");
}

/** The workspace file with one `patchedDependencies:` line, written as `pnpm patch-commit` writes it. */
function patching(key: string, value: string): (yaml: string) => string {
  return (yaml) => `${yaml}\npatchedDependencies:\n  '${key}': ${value}\n`;
}

/** Fixture options whose workspace file starts from `withoutRealPatches`. */
function fixture(options: FixtureOptions): FixtureOptions {
  const edit = options.workspaceYaml ?? ((yaml: string) => yaml);
  return { ...options, workspaceYaml: (yaml) => edit(withoutRealPatches(yaml)) };
}

/** The patch problems of the dependencies rule, warnings too (`runChecks` keeps only errors). */
function found(options: FixtureOptions): { errors: string[]; warnings: string[] } {
  const root = writeFixtureRepo([], fixture({ extraFiles: { [file]: patchText }, ...options }));
  let problems: readonly Problem[];
  try {
    problems = rules["dependencies"]?.(loadContext(root)).problems ?? [];
  } finally {
    removeFixtureRepo(root);
  }
  const about = problems.filter(
    (p) => p.file.endsWith("patches-allowed.json") || p.message.includes("patch"),
  );
  return {
    errors: about.filter((p) => p.severity === "error").map((p) => p.message),
    warnings: about.filter((p) => p.severity === "warning").map((p) => p.message),
  };
}

describe("tooling/check: allowed patches", () => {
  it("passes a listed patch of the catalog version with the listed file and hash", () => {
    const result = found({ workspaceYaml: patching(srt, file), patchesAllowed: allowing() });
    expect(result).toEqual({ errors: [], warnings: [] });
  });

  it("refuses a patch that isn't listed", () => {
    const { errors } = found({
      workspaceYaml: patching(srt, file),
      patchesAllowed: JSON.stringify({ allowed: [] }),
    });
    expect(errors.some((m) => m.startsWith(`"patchedDependencies: ${srt}" changes what`))).toBe(
      true,
    );
  });

  it("refuses a patch whose file changed after it was listed", () => {
    const { errors } = found({
      workspaceYaml: patching(srt, file),
      patchesAllowed: allowing(),
      extraFiles: { [file]: `${patchText}+more\n` },
    });
    expect(errors.some((m) => m.includes("its SHA-256 differs"))).toBe(true);
  });

  // HAL-7431: the list is read from the base commit, so a changed patch is approved first.
  describe("a changed patch, approved with next-sha256", () => {
    const changed = `${patchText}+more\n`;

    it("passes the patch in use while the change is approved", () => {
      const result = found({
        workspaceYaml: patching(srt, file),
        patchesAllowed: allowing({ "next-sha256": patchHash(changed) }),
      });
      expect(result).toEqual({ errors: [], warnings: [] });
    });

    it("passes the changed patch, with a warning to move its hash to sha256", () => {
      const { errors, warnings } = found({
        workspaceYaml: patching(srt, file),
        patchesAllowed: allowing({ "next-sha256": patchHash(changed) }),
        extraFiles: { [file]: changed },
      });
      expect(errors).toEqual([]);
      expect(warnings).toEqual([
        expect.stringContaining(`${file} is the patch next-sha256 lists for "${srt}"`),
      ]);
    });

    it("refuses a patch that is neither", () => {
      const { errors } = found({
        workspaceYaml: patching(srt, file),
        patchesAllowed: allowing({ "next-sha256": patchHash(changed) }),
        extraFiles: { [file]: `${changed}+again\n` },
      });
      expect(errors.some((m) => m.includes("its SHA-256 differs"))).toBe(true);
    });

    it("refuses a next-sha256 that isn't a hash or is the same as sha256", () => {
      const bad = (next: unknown, problem: string) =>
        found({ patchesAllowed: allowing({ "next-sha256": next }) }).errors.some((m) =>
          m.includes(problem),
        );
      expect(bad("ABC", "allowed[0].next-sha256 must be 64 lower-case hex digits")).toBe(true);
      expect(bad(1, "allowed[0].next-sha256 must be 64 lower-case hex digits")).toBe(true);
      expect(bad(patchHash(patchText), "allowed[0].next-sha256 must differ from sha256")).toBe(
        true,
      );
    });
  });

  it("gives a Windows checkout's line ends the same hash", () => {
    expect(patchHash(patchText.replaceAll("\n", "\r\n"))).toBe(patchHash(patchText));
  });

  it("refuses another file than the listed one, and a missing file", () => {
    const other = found({
      workspaceYaml: patching(srt, "patches/other.patch"),
      patchesAllowed: allowing(),
    });
    expect(other.errors.some((m) => m.includes(`must use ${file}`))).toBe(true);
    const missing = found({
      workspaceYaml: patching(srt, file),
      patchesAllowed: allowing(),
      extraFiles: {},
    });
    expect(missing.errors.some((m) => m.includes(`${file} is missing`))).toBe(true);
  });

  it("refuses a patch of another version than the catalog's, even when listed", () => {
    const old = "@anthropic-ai/sandbox-runtime@0.0.80";
    const { errors } = found({
      workspaceYaml: patching(old, file),
      patchesAllowed: allowing({ package: old }),
    });
    expect(errors.some((m) => m.includes("must patch the catalog version"))).toBe(true);
  });

  it("only warns about a listed entry with no patch, so the entry can land first", () => {
    const { errors, warnings } = found({ patchesAllowed: allowing() });
    expect(errors).toEqual([]);
    expect(warnings.some((m) => m.includes(`"${srt}" is allowed but`))).toBe(true);
  });

  it("reads patches-allowed.json strictly", () => {
    const bad = (entry: Record<string, unknown>) =>
      found({ patchesAllowed: allowing(entry) }).errors.some((m) => m.includes("allowed[0]"));
    expect(bad({ extra: 1 })).toBe(true);
    expect(bad({ package: "@anthropic-ai/sandbox-runtime" })).toBe(true);
    expect(bad({ package: "@anthropic-ai/sandbox-runtime@^0.0.81" })).toBe(true);
    expect(bad({ file: "elsewhere/x.patch" })).toBe(true);
    expect(bad({ sha256: "ABC" })).toBe(true);
    expect(bad({ reason: "short" })).toBe(true);
    expect(bad({ "remove-when": "" })).toBe(true);
    const badFile = (text: string, problem: string) =>
      found({ patchesAllowed: text }).errors.some((m) => m.includes(problem));
    expect(badFile("not json", "isn't valid JSON")).toBe(true);
    expect(badFile("{}", 'with an "allowed" list')).toBe(true);
    expect(badFile('{"allowed":[],"nope":1}', '"nope" is not a known setting')).toBe(true);
    expect(badFile('{"allowed":[1]}', "allowed[0] must be an object")).toBe(true);
    const twice = JSON.parse(allowing()).allowed[0];
    expect(badFile(JSON.stringify({ allowed: [twice, twice] }), `repeats ${srt}`)).toBe(true);
  });

  it("can't read a patchedDependencies value on the same line", () => {
    const workspaceYaml = (yaml: string) => `${yaml}\npatchedDependencies: {}\n`;
    const problems = runChecks([], fixture({ workspaceYaml, patchesAllowed: allowing() }));
    expect(problems.some((p) => p.message.startsWith("The check can't read this line"))).toBe(true);
  });
});
