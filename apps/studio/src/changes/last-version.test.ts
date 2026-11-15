import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { lastVersionDiffArgs, lastVersionFromDiff } from "./last-version.ts";

const diff = (...all: string[]) => `${all.join("\n")}\n`;
const header = ["diff --git a/a.txt b/a.txt", "index 1..2 100644", "--- a/a.txt", "+++ b/a.txt"];

verifies("source-control.change-list", () => {
  describe("lastVersionFromDiff", () => {
    it("asks git for the whole file as one hunk", () => {
      expect(lastVersionDiffArgs("agents/a.agent.yaml")).toEqual([
        "diff",
        "HEAD",
        "--no-color",
        "--unified=999999",
        "--",
        "agents/a.agent.yaml",
      ]);
    });

    it("keeps the context and removed lines and drops the added ones", () => {
      const text = diff(...header, "@@ -1,3 +1,3 @@", " one", "-two", "+three", " four");
      expect(lastVersionFromDiff(text, "one\nthree\nfour\n")).toBe("one\ntwo\nfour\n");
    });

    it("gives the current text back when git printed no difference", () => {
      expect(lastVersionFromDiff("", "same\n")).toBe("same\n");
    });

    it("says the file wasn't there for a new file", () => {
      const text = diff(
        "diff --git a/n.txt b/n.txt",
        "--- /dev/null",
        "+++ b/n.txt",
        "@@ -0,0 +1 @@",
        "+hi",
      );
      expect(lastVersionFromDiff(text, "hi\n")).toBeNull();
    });

    it("gives every line of a deleted file", () => {
      const text = diff("--- a/d.txt", "+++ /dev/null", "@@ -1,2 +0,0 @@", "-a", "-b");
      expect(lastVersionFromDiff(text, null)).toBe("a\nb\n");
    });

    it("keeps a missing final line break as it was", () => {
      const text = diff(
        ...header,
        "@@ -1,2 +1,2 @@",
        " one",
        "-two",
        "\\ No newline at end of file",
        "+three",
      );
      expect(lastVersionFromDiff(text, "one\nthree\n")).toBe("one\ntwo");
    });

    it("keeps a final line break the new file lost", () => {
      const text = diff(
        ...header,
        "@@ -1,2 +1,2 @@",
        " one",
        "-two",
        "+two",
        "\\ No newline at end of file",
      );
      expect(lastVersionFromDiff(text, "one\ntwo")).toBe("one\ntwo\n");
    });

    it("refuses a binary file", () => {
      const text = diff("diff --git a/i.png b/i.png", "Binary files a/i.png and b/i.png differ");
      expect(() => lastVersionFromDiff(text, null)).toThrow("isn't text");
    });
  });
});
