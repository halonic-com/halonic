import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

const agent = (...lines: string[]) => yaml("id: coder", "name: Coder", ...lines);

verifies("format.agent-asks", () => {
  it("leaves asks out of an agent whose file doesn't have it", () => {
    expect(parsedValue("agent", agent("harness: claude-code"))).not.toHaveProperty("asks");
  });

  it.each(["always", "in-sandbox"])("reads asks: %s on a Claude Code agent", (asks) => {
    const value = parsedValue("agent", agent("harness: claude-code", `asks: ${asks}`));
    expect(value.asks).toBe(asks);
  });

  it("refuses a value it doesn't know, at asks", () => {
    const problems = problemsOf("agent", agent("harness: claude-code", "asks: never"));
    expect(summary(problems)).toEqual(["asks invalid_value 4"]);
  });

  describe("refuses asks on any harness but Claude Code, even always", () => {
    it.each([
      ["Codex", ["harness: codex"]],
      ["Halonic's own loop", ["harness: halonic"]],
      ["Halonic's own loop", []],
    ])("%s", (harness, lines) => {
      for (const asks of ["always", "in-sandbox"]) {
        const problems = problemsOf("agent", agent(...lines, `asks: ${asks}`));
        expect(summary(problems)).toEqual([`asks asks-needs-claude-code ${3 + lines.length}`]);
        expect(problems[0]?.message).toBe(
          `asks works only for an agent with harness: claude-code, and this one runs in ${harness}. Remove asks, or set harness: claude-code.`,
        );
      }
    });
  });
});
