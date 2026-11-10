import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { addCounts, findingsIn, findingsTable, noFindings, severityOf } from "./findings.ts";

verifies("metrics.tagged-findings", () => {
  test("counts one finding per tagged line, after an optional list marker", () => {
    const review = ["- [blocker] Token in the log", "1. [major] No test", "[nit] Typo"].join("\n");
    expect(findingsIn(review)).toEqual({ blocker: 1, major: 1, minor: 0, nit: 1 });
  });

  test("accepts indents, other list markers, bold tags and any case", () => {
    expect(severityOf("  * [minor] name")).toBe("minor");
    expect(severityOf("+ [nit] wording")).toBe("nit");
    expect(severityOf("2) [major] retry")).toBe("major");
    expect(severityOf("**[blocker]** secret")).toBe("blocker");
    expect(severityOf("[Major] case")).toBe("major");
    expect(severityOf("[nit]")).toBe("nit");
  });

  test("leaves out quoted lines and code blocks", () => {
    const reply = [
      "> [major] No test",
      "Added one.",
      "```",
      "[minor] x",
      "~~~",
      "[minor] still inside the block",
      "```",
      "~~~md",
      "[nit] y",
      "~~~",
    ].join("\n");
    expect(findingsIn(reply)).toEqual(noFindings);
  });

  test("counts nothing when the tag is not first, unknown, or glued to the text", () => {
    expect(severityOf("See [major] above")).toBeUndefined();
    expect(severityOf("[critical] unknown tag")).toBeUndefined();
    expect(severityOf("[major]: no space")).toBeUndefined();
    expect(severityOf("**[major] half bold")).toBeUndefined();
    expect(findingsIn("Looks good to me.\r\nOne question: why 3?")).toEqual(noFindings);
  });

  test("counts again after a code block closes, and reads Windows line ends", () => {
    expect(findingsIn("```\n[nit] a\n```\r\n[nit] b\r\n")).toEqual({ ...noFindings, nit: 1 });
  });

  test("adds counts up and writes a table with a total row", () => {
    const one = { blocker: 1, major: 0, minor: 2, nit: 0 };
    const two = { blocker: 0, major: 1, minor: 0, nit: 3 };
    expect(addCounts(one, two)).toEqual({ blocker: 1, major: 1, minor: 2, nit: 3 });
    const table = findingsTable([
      { number: 12, title: "a", mergedAt: "2026-11-02T10:00:00Z", findings: one },
      { number: 15, title: "b | c", mergedAt: "2026-11-03T09:00:00Z", findings: two },
    ]).split("\n");
    expect(table[0]).toBe("| PR | merged | blocker | major | minor | nit | total |");
    expect(table.slice(2)).toEqual([
      "| #12 | 2026-11-02 | 1 | 0 | 2 | 0 | 3 |",
      "| #15 | 2026-11-03 | 0 | 1 | 0 | 3 | 4 |",
      "| **2 PRs** | | 1 | 1 | 2 | 3 | 7 |",
    ]);
  });
});
