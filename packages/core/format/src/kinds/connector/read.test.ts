import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { marksRead, parseFile } from "../../index.ts";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

/** A connector file whose `tools` lines are `lines`. */
function connectorWithTools(...lines: string[]): string {
  return yaml("id: tracker", "transport: { stdio: { command: mcp } }", "tools:", ...lines);
}

verifies("format.connector-read", () => {
  it("reads a list of tool names as written, with no warnings", () => {
    const text = connectorWithTools("  read: [search_issues]");
    const parsed = parseFile("connector", text);
    expect(parsed.ok && parsed.value.warnings).toEqual([]);
    expect(parsedValue("connector", text).tools).toEqual({ approve: [], read: ["search_issues"] });
  });

  it("refuses a value that isn't a list of tool names", () => {
    for (const value of ["search_issues", "all", "[1]"]) {
      const problems = problemsOf("connector", connectorWithTools(`  read: ${value}`));
      expect(problems.map((problem) => problem.message)).toEqual([
        '"read" must be a list of tool names.',
      ]);
    }
  });

  it("refuses a name that looks like a pattern, so it can't let in tools added later", () => {
    const problems = problemsOf(
      "connector",
      connectorWithTools("  read: [search_issues, 'search_*']"),
    );
    expect(summary(problems)).toEqual(["tools.read.1 read-tool-pattern 4"]);
    expect(problems[0]?.message).toBe(
      '"read" needs exact tool names. "search_*" looks like a pattern.',
    );
    for (const pattern of ["*", "get?", "[a-z]_list", "{a,b}"]) {
      const text = connectorWithTools(`  read: ['${pattern}']`);
      expect(summary(problemsOf("connector", text))).toEqual(["tools.read.0 read-tool-pattern 4"]);
    }
  });

  it("warns, without failing, about a name that tools.allow leaves out", () => {
    const text = connectorWithTools("  allow: [search_issues]", "  read: [search_isues]");
    const parsed = parseFile("connector", text);
    expect(parsed.ok && parsed.value.warnings).toEqual([
      {
        severity: "warning",
        source: "check",
        code: "read-tool-not-allowed",
        path: ["tools", "read", 0],
        message:
          '"read" lists "search_isues", but this connector has no tool by that name. Check the spelling.',
        line: 5,
        col: 10,
      },
    ]);
  });

  it("marks a tool as only reading when the list names it exactly", () => {
    const tools = { approve: [], read: ["search_issues"] };
    expect(marksRead(tools, "search_issues")).toBe(true);
    expect(marksRead(tools, "Search_issues")).toBe(false);
    expect(marksRead(tools, "search_issues ")).toBe(false);
    expect(marksRead(tools, "create_issue")).toBe(false);
  });

  it("lets approve win over read", () => {
    expect(
      marksRead({ approve: ["search_issues"], read: ["search_issues"] }, "search_issues"),
    ).toBe(false);
    expect(marksRead({ approve: "all", read: ["search_issues"] }, "search_issues")).toBe(false);
  });

  it("marks no tool without a read list", () => {
    expect(marksRead({ approve: [] }, "search_issues")).toBe(false);
    expect(marksRead({ approve: [], read: [] }, "search_issues")).toBe(false);
  });
});
