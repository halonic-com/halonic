import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";

verifies("format.agent-file", () => {
  it("fills in every default of a minimal agent", () => {
    expect(parsedValue("agent", yaml("id: clerk", "name: Clerk"))).toEqual({
      version: 1,
      id: "clerk",
      name: "Clerk",
      params: {},
      instructions: "",
      skills: [],
      knowledge: [],
      connectors: [],
      runLogs: false,
      collections: [],
      subagents: [],
      methods: {},
      output: { type: "text" },
      maxSteps: 6,
    });
  });

  it("fills in a method's input and output, and a character's look", () => {
    const text = yaml(
      "id: clerk",
      "name: Clerk",
      "methods:",
      "  extract:",
      "    instructions: Read the invoice.",
      "character: { colors: ['#3B82F6', '#8B5CF6'] }",
    );
    const agent = parsedValue("agent", text);
    expect(agent.methods["extract"]).toEqual({
      input: [],
      instructions: "Read the invoice.",
      output: "text",
    });
    expect(agent.character).toEqual({
      style: "buddy",
      surface: "soft",
      body: "elastic",
      top: "none",
      colors: ["#3B82F6", "#8B5CF6"],
    });
  });

  it("accepts a method that answers with typed JSON fields", () => {
    const text = yaml(
      "id: clerk",
      "name: Clerk",
      "methods:",
      "  extract:",
      "    instructions: Read it.",
      "    output: { vendor: string, amount: number, note: string? }",
    );
    expect(parsedValue("agent", text).methods["extract"]?.output).toEqual({
      vendor: "string",
      amount: "number",
      note: "string?",
    });
  });

  it("refuses a choice output without options", () => {
    const text = yaml(
      "id: reviewer",
      "name: Reviewer",
      "output:",
      "  type: choice",
      "  options: []",
    );
    expect(summary(problemsOf("agent", text))).toEqual(["output.options too_small 5"]);
  });

  it("refuses an unknown output type at the output", () => {
    const text = yaml("id: reviewer", "name: Reviewer", "output:", "  type: xml");
    expect(summary(problemsOf("agent", text))).toEqual(["output.type invalid_union 4"]);
  });

  it("refuses a method name with capitals, a bad colour and too many steps", () => {
    const text = yaml(
      "id: clerk",
      "name: Clerk",
      "maxSteps: 201",
      "methods:",
      "  Extract:",
      "    instructions: Read it.",
      "character: { colors: [blue, '#8B5CF6'] }",
    );
    expect(summary(problemsOf("agent", text))).toEqual([
      "methods.Extract invalid_key 6",
      "maxSteps too_big 3",
      "character.colors.0 invalid_format 7",
    ]);
  });

  it("refuses Halonic's own collections, whose names start with _", () => {
    const text = yaml(
      "id: clerk",
      "name: Clerk",
      "collections: [invoices, _tokens, _google_setups]",
    );
    expect(summary(problemsOf("agent", text))).toEqual([
      "collections.1 invalid_format 3",
      "collections.2 invalid_format 3",
    ]);
  });

  it("refuses a method without instructions", () => {
    const text = yaml("id: clerk", "name: Clerk", "methods:", "  extract:", "    input: [file]");
    expect(summary(problemsOf("agent", text))).toEqual([
      "methods.extract.instructions invalid_type 5",
    ]);
  });
});
