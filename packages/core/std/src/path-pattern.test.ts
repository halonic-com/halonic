import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ignoredByPatterns, readIgnoreFile, readPathPattern } from "./path-pattern.ts";

/** Whether the one pattern on `line` matches `path`. */
function matches(line: string, path: string): boolean {
  const pattern = readPathPattern(line);
  if (pattern === null) throw new Error(`'${line}' gave no pattern.`);
  return pattern.matches(path);
}

verifies("std.path-pattern", () => {
  describe("reading a line", () => {
    it.each(["", "   ", "# a comment", "!", "/"])("gives no pattern for %j", (line) => {
      expect(readPathPattern(line)).toBeNull();
    });

    it("reads a negation, a folder-only pattern and escapes", () => {
      expect(readPathPattern("!keep.log")).toMatchObject({ negated: true, folderOnly: false });
      expect(readPathPattern("dist/")).toMatchObject({ negated: false, folderOnly: true });
      expect(matches("\\#notes", "#notes")).toBe(true);
      expect(matches("\\!bang", "!bang")).toBe(true);
      expect(readPathPattern("\\!bang")?.negated).toBe(false);
    });

    it("drops trailing spaces unless one is escaped", () => {
      expect(matches("notes.txt   ", "notes.txt")).toBe(true);
      expect(matches("notes\\ ", "notes ")).toBe(true);
    });

    it("gives no pattern for a set that isn't valid", () => {
      expect(readPathPattern("[z-a].txt")).toBeNull();
    });
  });

  describe("matching", () => {
    it.each([
      ["*.log", "today.log", true],
      ["*.log", "logs/today.log", true],
      ["*.log", "today.log.txt", false],
      ["build", "packages/acme/build", true],
      ["/build", "packages/acme/build", false],
      ["/build", "build", true],
      ["docs/*.md", "docs/a.md", true],
      ["docs/*.md", "docs/deep/a.md", false],
      ["docs/*.md", "other/docs/a.md", false],
      ["?.txt", "a.txt", true],
      ["?.txt", "ab.txt", false],
      ["[abc].txt", "b.txt", true],
      ["[!abc].txt", "b.txt", false],
      ["[!abc].txt", "d.txt", true],
      ["**/fixtures", "a/b/fixtures", true],
      ["**/fixtures", "fixtures", true],
      ["logs/**", "logs/a/b.log", true],
      ["logs/**", "logs", false],
      ["a/**/b", "a/b", true],
      ["a/**/b", "a/x/y/b", true],
      ["a**b", "axxb", true],
      ["a**b", "ax/xb", false],
      ["a.b", "axb", false],
      ["(x)+", "(x)+", true],
    ])("%j against %j: %s", (line, path, expected) => {
      expect(matches(line, path)).toBe(expected);
    });
  });

  describe("deciding with several patterns", () => {
    it("lets the last matching pattern decide", () => {
      const patterns = readIgnoreFile("*.log\n!keep.log\n# comment\n\nsecret.log\n");
      expect(ignoredByPatterns(patterns, "today.log", false)).toBe(true);
      expect(ignoredByPatterns(patterns, "keep.log", false)).toBe(false);
      expect(ignoredByPatterns(patterns, "secret.log", false)).toBe(true);
    });

    it("says nothing when no pattern matches", () => {
      expect(ignoredByPatterns(readIgnoreFile("*.log"), "src/a.ts", false)).toBeUndefined();
    });

    it("matches a folder-only pattern only against folders", () => {
      const patterns = readIgnoreFile("dist/\r\n");
      expect(ignoredByPatterns(patterns, "dist", true)).toBe(true);
      expect(ignoredByPatterns(patterns, "dist", false)).toBeUndefined();
      expect(ignoredByPatterns(patterns, "packages/a/dist", true)).toBe(true);
    });
  });
});
