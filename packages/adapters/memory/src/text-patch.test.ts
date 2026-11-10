import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { unifiedDiff } from "./line-diff.ts";
import { PatchFormatError, PatchMismatchError } from "./patch-errors.ts";
import {
  applyFilePatch,
  type FilePatch,
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

    it("refuses with a RangeError, like every input the Vcs port refuses", () => {
      expect(() => parsePatch("")).toThrow(RangeError);
    });

    it("reads an empty file git creates or deletes, which has no --- line", () => {
      const created =
        "diff --git a/e.yaml b/e.yaml\nnew file mode 100644\nindex 0000000..e69de29\n";
      const deleted =
        "diff --git a/d.yaml b/d.yaml\ndeleted file mode 100644\nindex e69de29..0000000\n";
      expect(parsePatch(created + deleted)).toEqual([
        { oldPath: null, newPath: "e.yaml", hunks: [] },
        { oldPath: "d.yaml", newPath: null, hunks: [] },
      ]);
      expect(applyFilePatch(null, onlyFile(created))).toBe("");
    });

    it("reads a text edit to an executable file, which keeps its mode", () => {
      const patch = twoHunks.replace(
        "index 1111111..2222222 100644",
        "index 1111111..2222222 100755",
      );
      expect(applyFilePatch(before, onlyFile(patch))).toBe(after);
    });

    const lines = (...text: string[]) => `${text.join("\n")}\n`;
    const textLines = lines("--- a/a.yaml", "+++ b/a.yaml", "@@ -1 +1 @@", "-1", "+2");
    it.each([
      [lines("diff --git a/a.yaml b/a.yaml", "old mode 100644", "new mode 100755"), '"old mode"'],
      [lines("diff --git a/a.yaml b/a.yaml", "new mode 100755") + textLines, '"new mode"'],
      [
        lines("diff --git a/l b/l", "new file mode 120000", "--- /dev/null", "+++ b/l"),
        "mode 120000",
      ],
      [lines("diff --git a/s b/s", "new file mode 160000"), "mode 160000"],
      [lines("diff --git a/x b/x", "new file mode 100755"), "mode 100755"],
      [lines("diff --git a/a.yaml b/a.yaml", "deleted file mode 120000"), "mode 120000"],
      [lines("diff --git a/s b/s", "index 1111111..2222222 160000"), "mode 160000"],
      [lines("diff --git a/a.yaml b/c.yaml", "rename from a.yaml"), "names two paths"],
      [
        lines("similarity index 100%", "rename from a.yaml", "rename to c.yaml"),
        '"similarity index"',
      ],
      [lines("copy from a.yaml", "copy to c.yaml"), '"copy from"'],
      [lines('diff --git "a/\\303x" "b/\\303x"'), "quoted path"],
      [lines("diff --git a/x.yaml b/x.yaml", "index 1111111..2222222 100644"), 'has no "---" line'],
      [lines("diff --git a/a.yaml b/a.yaml", "--- a/b.yaml", "+++ b/b.yaml"), "diff --git header"],
      [
        lines("diff --git a/a.yaml b/a.yaml", "new file mode 100644") + textLines,
        "diff --git header",
      ],
      [
        lines("diff --git a/a.yaml b/a.yaml", "deleted file mode 100644") + textLines,
        "diff --git header",
      ],
    ])("refuses anything but a text file's lines changing: %j", (patch, reason) => {
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

    const keep = unifiedDiff("keep.yaml", "k\n", "K\n");
    const section = (...text: string[]) => `${text.join("\n")}\n`;
    it.each([
      [
        "a pure rename",
        section(
          "diff --git a/x.yaml b/y.yaml",
          "similarity index 100%",
          "rename from x.yaml",
          "rename to y.yaml",
        ),
        "names two paths",
      ],
      [
        "a copy",
        section("diff --git a/x.yaml b/x.yaml", "copy from x.yaml", "copy to y.yaml"),
        '"copy from"',
      ],
      [
        "a mode change",
        section("diff --git a/x.yaml b/x.yaml", "old mode 100644", "new mode 100755"),
        '"old mode"',
      ],
      [
        "a symbolic link",
        section(
          "diff --git a/l b/l",
          "new file mode 120000",
          "index 0000000..1111111",
          "--- /dev/null",
          "+++ b/l",
          "@@ -0,0 +1 @@",
          "+target",
          "\\ No newline at end of file",
        ),
        "mode 120000",
      ],
      [
        "a gitlink",
        section(
          "diff --git a/s b/s",
          "new file mode 160000",
          "index 0000000..1111111",
          "--- /dev/null",
          "+++ b/s",
          "@@ -0,0 +1 @@",
          "+Subproject commit 1111111111111111111111111111111111111111",
        ),
        "mode 160000",
      ],
      [
        "the same file twice",
        unifiedDiff("x.yaml", "a\n", "A\n") + unifiedDiff("x.yaml", "a\n", "Z\n"),
        "changes x.yaml more than once",
      ],
    ])("refuses %s next to another file, before reading any", async (_, refused, reason) => {
      for (const patch of [refused + keep, keep + refused]) {
        const read: string[] = [];
        const applying = patchedFiles(
          patch,
          false,
          () => {},
          async (path) => {
            read.push(path);
            return "a\n";
          },
        );
        await expect(applying).rejects.toThrow(PatchFormatError);
        await expect(applying).rejects.toThrow(reason);
        expect(read).toEqual([]);
      }
    });

    it("names the file that no longer matches", async () => {
      const applying = patchedFiles(
        keep + unifiedDiff("x.yaml", "a\n", "A\n"),
        false,
        () => {},
        async (path) => (path === "keep.yaml" ? "k\n" : "edited\n"),
      );
      await expect(applying).rejects.toThrow("The change no longer matches the file. (x.yaml)");
      await expect(applying).rejects.toMatchObject({ path: "x.yaml" });
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
