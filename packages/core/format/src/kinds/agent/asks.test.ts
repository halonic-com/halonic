import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

const agent = (...lines: string[]) => yaml("id: coder", "name: Coder", ...lines);

verifies("format.agent-asks", () => {
  it("leaves asks out of an agent whose file doesn't have it", () => {
    expect(parsedValue("agent", agent("harness: claude-code"))).not.toHaveProperty("asks");
  });

  it.each([
    ["claude-code", "always"],
    ["claude-code", "in-sandbox"],
    ["codex", "always"],
    ["codex", "in-sandbox"],
    ["opencode", "in-sandbox"],
  ])("reads asks on a %s agent: %s", (harness, asks) => {
    const value = parsedValue("agent", agent(`harness: ${harness}`, `asks: ${asks}`));
    expect(value.asks).toBe(asks);
  });

  it("refuses a value it doesn't know, at asks", () => {
    const problems = problemsOf("agent", agent("harness: claude-code", "asks: never"));
    expect(summary(problems)).toEqual(["asks invalid_value 4"]);
  });

  describe("refuses asks on Halonic's own loop, even always", () => {
    it.each([
      ["Halonic's own loop", ["harness: halonic"]],
      ["Halonic's own loop", []],
    ])("%s", (harness, lines) => {
      for (const asks of ["always", "in-sandbox"]) {
        const problems = problemsOf("agent", agent(...lines, `asks: ${asks}`));
        expect(summary(problems)).toEqual([
          `asks asks-needs-a-program-harness ${3 + lines.length}`,
        ]);
        expect(problems[0]?.message).toBe(
          `asks works only for an agent with harness: claude-code, codex or opencode, and this one runs in ${harness}. Remove asks, or set one of those harnesses.`,
        );
      }
    });
  });
});
