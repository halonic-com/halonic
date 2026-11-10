import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { unifiedDiff } from "./line-diff.ts";
import {
  applyFilePatch,
  type FilePatch,
  PatchFormatError,
  PatchMismatchError,
  parsePatch,
  patchedFiles,
  reversePatch,
} from "./text-patch.ts";

const before = "a\nb\nc\nd\ne\nf\ng\nh\ni\nj\n";
const after = "a\nB\nc\nd\ne\nf\ng\nh\nI\nj\n";

/** `before` -> `after` as git writes it: one hunk per change, one line of context. */
const twoHunks = [
  "diff --git a/x.yaml b/x.yaml",
  "index 1111111..2222222 100644",
  "--- a/x.yaml",
  "+++ b/x.yaml",
  "@@ -1,3 +1,3 @@",
  " a",
  "-b",
  "+B",
  " c",
  "@@ -8,3 +8,3 @@ g",
  " h",
  "-i",
  "+I",
  " j",
  "",
].join("\n");

/** Only the second hunk of {@link twoHunks}: what the Studio sends to discard it. */
const secondHunk = [
  "--- a/x.yaml",
  "+++ b/x.yaml",
  "@@ -8,3 +8,3 @@",
  " h",
  "-i",
  "+I",
  " j",
  "",
].join("\n");

function onlyFile(patch: string): FilePatch {
  const [file] = parsePatch(patch);
  return file as FilePatch;
}

verifies("memory.text-patch", () => {
  describe("applying", () => {
    it("applies every hunk, and its reverse undoes it", () => {
      const file = onlyFile(twoHunks);
      expect(applyFilePatch(before, file)).toBe(after);
      expect(applyFilePatch(after, reversePatch(file))).toBe(before);
    });

    it("undoes one hunk and leaves the other", () => {
      const reversed = reversePatch(onlyFile(secondHunk));
      expect(applyFilePatch(after, reversed)).toBe("a\nB\nc\nd\ne\nf\ng\nh\ni\nj\n");
    });

    it("finds a hunk moved down by lines added above it", () => {
      expect(applyFilePatch(`new\n${before}`, onlyFile(secondHunk))).toBe(
        `new\n${"a\nb\nc\nd\ne\nf\ng\nh\nI\nj\n"}`,
      );
    });

    it("finds a hunk moved up by lines removed above it", () => {
      expect(applyFilePatch(before.slice(2), onlyFile(secondHunk))).toBe(
        "b\nc\nd\ne\nf\ng\nh\nI\nj\n",
      );
    });

    it("refuses a hunk whose lines were edited since", () => {
      expect(() => applyFilePatch(before.replace("i\n", "edited\n"), onlyFile(secondHunk))).toThrow(
        PatchMismatchError,
      );
    });

    it("creates and deletes whole files", () => {
      const created = onlyFile(unifiedDiff("n.yaml", null, "one\ntwo"));
      expect(applyFilePatch(null, created)).toBe("one\ntwo");
      expect(applyFilePatch("one\ntwo", reversePatch(created))).toBeNull();
    });

    it("refuses to create a file that exists, or to change one that doesn't", () => {
      const created = onlyFile(unifiedDiff("n.yaml", null, "one\n"));
      expect(() => applyFilePatch("one\n", created)).toThrow(PatchMismatchError);
      expect(() => applyFilePatch(null, onlyFile(twoHunks))).toThrow(PatchMismatchError);
    });

    it("refuses a deletion that would leave lines behind", () => {
      const deleted = onlyFile(
        ["--- a/d.yaml", "+++ /dev/null", "@@ -1 +0,0 @@", "-one", ""].join("\n"),
      );
      expect(() => applyFilePatch("one\ntwo\n", deleted)).toThrow(PatchMismatchError);
    });

    it("keeps a missing last newline apart from a present one", () => {
      const patch = onlyFile(unifiedDiff("x.yaml", "one\n", "one"));
      expect(applyFilePatch("one\n", patch)).toBe("one");
      expect(() => applyFilePatch("one", patch)).toThrow(PatchMismatchError);
      const context = onlyFile(unifiedDiff("x.yaml", "zero\none", "ZERO\none"));
      expect(applyFilePatch("zero\none", context)).toBe("ZERO\none");
      expect(applyFilePatch("one", onlyFile(unifiedDiff("x.yaml", "one", "two\n")))).toBe("two\n");
    });

    it("inserts lines where a hunk with no old lines says", () => {
      const patch = onlyFile(
        ["--- a/x.yaml", "+++ b/x.yaml", "@@ -1,0 +2 @@", "+new", ""].join("\n"),
      );
      expect(applyFilePatch("a\nb\n", patch)).toBe("a\nnew\nb\n");
    });
  });

  describe("reading", () => {
    it("reads paths with a date after a tab, and a context line an editor stripped", () => {
      const file = onlyFile(
        [
          "--- a/x.yaml\t2026-11-10",
          "+++ b/x.yaml\t2026-11-10",
          "@@ -1,2 +1,2 @@",
          "",
          "-b",
          "+B",
          "",
        ].join("\n"),
      );
      expect(file).toMatchObject({ oldPath: "x.yaml", newPath: "x.yaml" });
      expect(applyFilePatch("\nb\n", file)).toBe("\nB\n");
    });

    it("reads a file header that ends the patch, with no hunks", () => {
      expect(parsePatch("--- a/x.yaml\n+++ b/x.yaml")).toEqual([
        { oldPath: "x.yaml", newPath: "x.yaml", hunks: [] },
      ]);
    });

    it.each([
      ["", "it changes no file"],
      ["diff --git a/x b/x\nBinary files a/x and b/x differ\n", "binary"],
      ["diff --git a/x b/x\nGIT binary patch\n", "binary"],
      ["--- a/x\n@@ -1 +1 @@\n", 'no "+++" line'],
      ["--- a/x", 'no "+++" line'],
      ["--- /dev/null\n+++ /dev/null\n", "no path on either side"],
      ["--- a/x\n+++ b/y\n", "renames aren't supported"],
      ['--- "a/\\303x"\n+++ "b/\\303x"\n', "quoted path"],
      ["--- x\n+++ x\n", "no a/ or b/ prefix"],
      ["--- a/x\n+++ b/x\n@@ -1,3 +1,3 @@\n a\n", "ends early"],
      ["--- a/x\n+++ b/x\n@@ -1 +1 @@\n*a\n", "unexpected line"],
      ["--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n-b\n+c\n", "doesn't match its line counts"],
    ])("refuses %j", (patch, reason) => {
      expect(() => parsePatch(patch)).toThrow(PatchFormatError);
      expect(() => parsePatch(patch)).toThrow(reason);
    });
  });

  describe("patchedFiles", () => {
    it("checks every path, then gives each file's new text without writing", async () => {
      const checked: string[] = [];
      const files = new Map([["x.yaml", before]]);
      const created = unifiedDiff("n.yaml", null, "n\n");
      const results = await patchedFiles(
        `${twoHunks}${created}`,
        false,
        (path) => checked.push(path),
        async (path) => files.get(path) ?? null,
      );
      expect(checked).toEqual(["x.yaml", "x.yaml", "n.yaml"]);
      expect(results).toEqual(
        new Map([
          ["x.yaml", after],
          ["n.yaml", "n\n"],
        ]),
      );
      expect(files.get("x.yaml")).toBe(before);
    });

    it("gives null for a file the patch deletes", async () => {
      const results = await patchedFiles(
        unifiedDiff("d.yaml", "d\n", null),
        false,
        () => {},
        async () => "d\n",
      );
      expect(results).toEqual(new Map([["d.yaml", null]]));
    });

    it("reverses when asked", async () => {
      const results = await patchedFiles(
        secondHunk,
        true,
        () => {},
        async () => after,
      );
      expect(results.get("x.yaml")).toBe("a\nB\nc\nd\ne\nf\ng\nh\ni\nj\n");
    });
  });
});
