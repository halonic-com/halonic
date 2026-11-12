import type { AgentMethod } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { methodPrompt } from "./method-prompt.ts";

/** The base fixture's `clerk` method, as the format reads it. */
const extract: AgentMethod = {
  description: "Pull the vendor and amount out of an invoice.",
  input: ["invoice"],
  instructions: "Extract the vendor and amount from: {{invoice}}",
  tools: [],
  model: "careful",
  maxSteps: 2,
  output: { vendor: "string", amount: "number", note: "string?" },
};

verifies("workflow.method-prompt", () => {
  // New: the old engine's prompt for the base fixture's `extract` step, from its run log.
  it("writes the method's prompt as the old engine did", () => {
    const scope = { input: { invoice: "Acme Paper, 120 EUR" }, context: {} };
    expect(methodPrompt("extract", extract, { invoice: "{{input.invoice}}" }, scope)).toBe(
      'Method "extract": Pull the vendor and amount out of an invoice.\n\n' +
        "Extract the vendor and amount from: Acme Paper, 120 EUR\n\n" +
        "Answer with JSON with these fields: vendor (string), amount (number), note (string, may be left out).",
    );
  });

  // New.
  it("leaves out the description and the fields line when the method has neither", () => {
    const summarize: AgentMethod = {
      input: [],
      instructions: "Summarize the day.",
      output: "text",
    };
    expect(methodPrompt("summarize", summarize, undefined, {})).toBe(
      'Method "summarize".\n\nSummarize the day.',
    );
  });

  // New.
  it("renders each with value against the run, keeping its type, and nothing else", () => {
    const tag: AgentMethod = {
      input: ["tags"],
      instructions: "Tags: {{tags}}. Input: {{input.from}}",
      output: "text",
    };
    const scope = { input: { from: "support" }, context: { tags: ["school", "trip"] } };
    expect(methodPrompt("tag", tag, { tags: "{{context.tags}}" }, scope)).toBe(
      'Method "tag".\n\nTags: ["school","trip"]. Input: ',
    );
  });
});
