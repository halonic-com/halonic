import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { parseLog, parseStatus } from "./git-output.ts";

// The status parsing itself is tested where it lives, in the ports' `vcs-status.test.ts`.

const modes = "N... 100644 100644 100644";
const hashes = "1111111 2222222";

function status(...records: string[]) {
  return parseStatus(Buffer.from(`${records.join("\0")}\0`));
}

verifies("git.vcs", () => {
  describe("git status output", () => {
    it("reads the bytes as text, with the branch and the changes", () => {
      const parsed = status(
        "# branch.head main",
        `1 .M ${modes} ${hashes} models.yaml`,
        "? notes.md",
      );
      expect(parsed).toMatchObject({ isRepo: true, branch: "main" });
      expect(parsed.changes).toEqual([
        { path: "models.yaml", status: "modified", staged: false },
        { path: "notes.md", status: "untracked", staged: false },
      ]);
    });
  });

  describe("git log output", () => {
    it("reads each commit, with only the first line of its message, and an empty log", () => {
      const hash = "a".repeat(40);
      const output = `${hash}\0Acme Tester\x002026-11-10T01:02:03+01:00\0First line\nSecond line\n`;
      expect(parseLog(Buffer.from(output))).toEqual([
        { hash, author: "Acme Tester", date: "2026-11-10T00:02:03.000Z", message: "First line" },
      ]);
      expect(parseLog(Buffer.alloc(0))).toEqual([]);
    });
  });
});
