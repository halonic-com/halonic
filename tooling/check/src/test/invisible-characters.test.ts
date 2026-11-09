import { describe, expect, it } from "vitest";
import { escapeFor, findHiddenCharacters, kindOf } from "../rules/invisible-characters.ts";
import { runChecks } from "./fixture-repo.ts";

/** The code points the check finds in a text, in order. */
function hiddenIn(text: string): number[] {
  return findHiddenCharacters(text).map(({ codePoint }) => codePoint);
}

describe("tooling/check: invisible characters", () => {
  it.each([
    ["a zero-width space", "a\u200Bb", 0x200b],
    ["a soft hyphen", "unt\u00ADrusted", 0x00ad],
    ["a right-to-left override", "x-\u202Ey", 0x202e],
    ["a right-to-left isolate", "\u2067abc", 0x2067],
    ["a byte order mark", "\uFEFFexport {};", 0xfeff],
    ["a tag letter", "hi\u{E0041}", 0xe0041],
    ["a variation selector on a letter", "a\uFE0F", 0xfe0f],
    ["a supplementary variation selector", "a\u{E0100}", 0xe0100],
    ["a bell", "ring\u0007", 0x07],
    ["an escape", "\u001B[31m", 0x1b],
    ["a delete", "a\u007F", 0x7f],
    ["a C1 next line", "a\u0085b", 0x85],
    ["a line separator", "a\u2028b", 0x2028],
    ["a paragraph separator", "a\u2029b", 0x2029],
    ["a Hangul choseong filler", "let \u115F = 1;", 0x115f],
    ["a Hangul jungseong filler", "let \u1160 = 1;", 0x1160],
    ["a Hangul filler as a name", "const \u3164 = 1;", 0x3164],
    ["a halfwidth Hangul filler", "if (\uFFA0) {}", 0xffa0],
  ])("finds %s", (_, text, codePoint) => {
    expect(hiddenIn(text)).toEqual([codePoint]);
  });

  it("allows tab, line feed, carriage return and visible non-ASCII", () => {
    expect(hiddenIn("a\tb\r\nc\n")).toEqual([]);
    expect(
      hiddenIn("Gr\u00FC\u00DFe, \u65E5\u672C\u8A9E, caf\u00E9, \u00D7 \u2215 \uFF1C"),
    ).toEqual([]);
  });

  it.each([
    ["a plain emoji", "\u{1F600}"],
    ["a warning sign shown as emoji", "\u26A0\uFE0F"],
    ["a heart shown as text", "\u2764\uFE0E"],
    ["a family joined by zero-width joiners", "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}"],
    ["a coder with a skin tone", "\u{1F469}\u{1F3FD}\u200D\u{1F4BB}"],
    ["a keycap digit", "1\uFE0F\u20E3"],
  ])("allows %s", (_, emoji) => {
    expect(hiddenIn(`Done ${emoji} today.`)).toEqual([]);
  });

  it("still finds a joiner or tag letters next to an emoji", () => {
    expect(hiddenIn("\u{1F600}\u200Dx")).toEqual([0x200d]);
    expect(hiddenIn("\u{1F3F4}\u{E0067}\u{E0062}\u{E007F}")).toEqual([0xe0067, 0xe0062, 0xe007f]);
  });

  it("gives the line and the column in characters", () => {
    expect(findHiddenCharacters("first\n\u{1F600} x\u202Ey\nlast")).toEqual([
      { line: 2, column: 4, codePoint: 0x202e },
    ]);
  });

  it("names the kind and the escape of a character", () => {
    expect(
      [0x202e, 0xe0041, 0xfe0f, 0x07, 0x200b, 0x2028, 0x2029, 0x115f, 0x3164, 0xffa0, 0x00ad].map(
        kindOf,
      ),
    ).toEqual([
      "a bidi control",
      "a tag character",
      "a variation selector",
      "a control character",
      "a zero-width character",
      "a line or paragraph separator",
      "a line or paragraph separator",
      "a Hangul filler",
      "a Hangul filler",
      "a Hangul filler",
      "an invisible format character",
    ]);
    expect(escapeFor(0x202e)).toBe("\\u202E");
    expect(escapeFor(0xad)).toBe("\\u00AD");
    expect(escapeFor(0xe0041)).toBe("\\u{E0041}");
    expect(escapeFor(0x202e, "crates/a/src/lib.rs")).toBe("\\u{202E}");
  });

  it("fails on code, tests and docs, one finding per line", () => {
    const problems = runChecks([], {
      extraFiles: {
        "tooling/a.ts": 'const name = "a\u202Eb\u202Ec";\n',
        "tooling/b.test.ts": 'it("x", () => "\u200B");\n',
        "docs/c.md": "# Title\n\nSee <\u200B/untrusted>.\n",
      },
    }).filter((problem) => problem.rule === "invisible-characters");
    expect(problems.map(({ file, line }) => `${file}:${line}`).sort()).toEqual([
      "docs/c.md:3",
      "tooling/a.ts:1",
      "tooling/b.test.ts:1",
    ]);
    expect(problems.find(({ file }) => file === "tooling/a.ts")?.message).toBe(
      'Column 16 holds U+202E, a bidi control that can\'t be seen in an editor or a review (and 1 more on this line). In code, write it as an escape such as "\\u202E"; in docs, name it in words.',
    );
  });

  it("checks Rust, shell, SVG and plain text files", () => {
    const problems = runChecks([], {
      extraFiles: {
        "apps/a/src/lib.rs": 'let name = "a\u202Eb";\n',
        "tooling/b.sh": "echo \u200Bhi\n",
        "apps/c/icon.svg": "<svg><title>x\u3164</title></svg>\n",
        "tooling/d.txt": "one\u2028two\n",
      },
    }).filter((problem) => problem.rule === "invisible-characters");
    expect(problems.map(({ file }) => file).sort()).toEqual([
      "apps/a/src/lib.rs",
      "apps/c/icon.svg",
      "tooling/b.sh",
      "tooling/d.txt",
    ]);
    expect(problems.find(({ file }) => file.endsWith(".rs"))?.message).toContain('"\\u{202E}"');
  });

  it("leaves files that aren't text alone", () => {
    const problems = runChecks([], { extraFiles: { "assets/logo.bin": "\u0000\u0001\u200B" } });
    expect(problems.filter((problem) => problem.rule === "invisible-characters")).toEqual([]);
  });
});
