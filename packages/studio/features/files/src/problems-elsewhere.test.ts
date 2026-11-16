import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { FileIssue } from "./files-host.ts";
import {
  causedElsewhere,
  problemsElsewhere,
  sortedForList,
  withNewSince,
} from "./problems-elsewhere.ts";

function issue(file: string, severity: "error" | "warning", line: number, col = 1): FileIssue {
  return { file, severity, message: `${severity} at ${line}`, line, col };
}

describe("problems caused elsewhere", () => {
  verifies("files.ui.problems-list", () => {
    it("counts only problems in other files that the first check did not have", () => {
      const old = issue("b.yaml", "error", 2);
      const before = problemsElsewhere("a.yaml", [old, issue("a.yaml", "error", 1)]);
      const now = [
        issue("a.yaml", "error", 9),
        old,
        issue("c.yaml", "error", 4),
        issue("b.yaml", "warning", 7),
      ];

      expect(causedElsewhere("a.yaml", before, now)).toEqual({ count: 2, firstFile: "c.yaml" });
    });

    it("counts a problem that appears again beyond the ones that were there", () => {
      const old = issue("b.yaml", "error", 2);
      const before = problemsElsewhere("a.yaml", [old]);

      expect(causedElsewhere("a.yaml", before, [old, old])).toEqual({
        count: 1,
        firstFile: "b.yaml",
      });
    });

    it("counts none when problems went away or stayed", () => {
      const old = issue("b.yaml", "error", 2);
      const before = problemsElsewhere("a.yaml", [old, issue("b.yaml", "error", 3)]);

      expect(causedElsewhere("a.yaml", before, [old])).toEqual({ count: 0, firstFile: undefined });
    });

    it("moves the baseline past problems that appeared between two checks", () => {
      const old = issue("b.yaml", "error", 2);
      const fresh = issue("c.yaml", "error", 4);
      const before = problemsElsewhere("a.yaml", [old]);
      const last = problemsElsewhere("a.yaml", [old]);
      const now = [old, fresh];

      const moved = withNewSince(before, last, problemsElsewhere("a.yaml", now));

      expect(causedElsewhere("a.yaml", moved, now)).toEqual({ count: 0, firstFile: undefined });
    });

    it("sorts errors before warnings, then by line and column", () => {
      const sorted = sortedForList([
        issue("a", "warning", 1),
        issue("a", "error", 5),
        issue("a", "error", 3, 9),
        issue("a", "error", 3, 2),
      ]);

      expect(sorted.map((i) => `${i.severity}:${i.line}:${i.col}`)).toEqual([
        "error:3:2",
        "error:3:9",
        "error:5:1",
        "warning:1:1",
      ]);
    });
  });
});
