import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

const agent = (...lines: string[]) => yaml("id: helper", "name: Helper", ...lines);

verifies("format.agent-chat-ui", () => {
  it("leaves chatUi out of an agent whose file doesn't have it, so components are off", () => {
    expect(parsedValue("agent", agent())).not.toHaveProperty("chatUi");
  });

  it("reads all four components", () => {
    const value = parsedValue(
      "agent",
      agent("chatUi: { components: [card, table, form, buttons] }"),
    );
    expect(value.chatUi).toEqual({ components: ["card", "table", "form", "buttons"] });
  });

  it("reads one component alone", () => {
    const value = parsedValue("agent", agent("chatUi: { components: [table] }"));
    expect(value.chatUi).toEqual({ components: ["table"] });
  });

  it("refuses a component it doesn't know, naming it", () => {
    const problems = problemsOf("agent", agent("chatUi: { components: [card, chart] }"));
    expect(summary(problems)).toEqual(["chatUi.components.1 invalid_value 3"]);
    expect(problems[0]?.message).toBe(
      'Unknown chat component "chart". Use one of: card, table, form, buttons.',
    );
  });

  it("refuses an empty list and a component named twice", () => {
    expect(summary(problemsOf("agent", agent("chatUi: { components: [] }")))).toEqual([
      "chatUi.components too_small 3",
    ]);
    const twice = problemsOf("agent", agent("chatUi: { components: [card, card] }"));
    expect(summary(twice)).toEqual(["chatUi.components custom 3"]);
    expect(twice[0]?.message).toBe("Name each chat component once.");
  });

  it("refuses a field the block doesn't have", () => {
    expect(
      summary(problemsOf("agent", agent("chatUi: { components: [card], images: true }"))),
    ).toEqual(["chatUi unrecognized_keys 3"]);
  });

  it("keeps chatUi apart from output", () => {
    const value = parsedValue(
      "agent",
      agent("output: { type: choice, options: [yes, no] }", "chatUi: { components: [buttons] }"),
    );
    expect(value.output).toEqual({ type: "choice", options: ["yes", "no"] });
    expect(value.chatUi).toEqual({ components: ["buttons"] });
    expect(parsedValue("agent", agent("chatUi: { components: [card] }")).output).toEqual({
      type: "text",
    });
  });
});
