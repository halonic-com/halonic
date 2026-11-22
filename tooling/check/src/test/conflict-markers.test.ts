import { describe, expect, it } from "vitest";
import { runChecks } from "./fixture-repo.ts";

// Built from parts so this file doesn't trip the check it tests.
const ours = `${"<".repeat(7)} HEAD`;
const middle = "=".repeat(7);
const theirs = `${">".repeat(7)} 1a2b3c4 (feat: x)`;

/** The `file:line` of each conflict-markers finding for these files. */
function findings(files: Readonly<Record<string, string>>): string[] {
  return runChecks([], { extraFiles: files })
    .filter((problem) => problem.rule === "conflict-markers")
    .map(({ file, line }) => `${file}:${line}`)
    .sort();
}

describe("tooling/check: conflict markers", () => {
  it("fails on each marker line, inside a doc comment too", () => {
    expect(
      findings({
        "tooling/a.ts": `/**\n${ours}\n * One.\n${middle}\n * Two.\n${theirs}\n */\nexport const a = 1;\n`,
        "docs/b.md": `# B\n\n${ours}\nx\n${middle}\r\ny\n${theirs}\n`,
      }),
    ).toEqual([
      "docs/b.md:3",
      "docs/b.md:5",
      "docs/b.md:7",
      "tooling/a.ts:2",
      "tooling/a.ts:4",
      "tooling/a.ts:6",
    ]);
  });

  it("checks files of any kind, such as a lockfile", () => {
    expect(findings({ "Cargo.lock": `${ours}\n` })).toEqual(["Cargo.lock:1"]);
  });

  it("allows look-alikes that aren't markers", () => {
    expect(
      findings({
        "docs/c.md": `Title\n${"=".repeat(8)}\n\n  ${ours}\n${"<".repeat(7)}\n${"=".repeat(7)} x\n`,
        "assets/d.bin": `\0${ours}\n`,
      }),
    ).toEqual([]);
  });
});
