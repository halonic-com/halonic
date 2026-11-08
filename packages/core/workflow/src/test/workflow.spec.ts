// Test helpers: build a workflow the way a file gives it, with every default
// filled in, so the rules are tested on the same values the engine sees.
import { parseFile, type Workflow } from "@halonicjs/format";
import { expect } from "vitest";

/**
 * Reads a workflow from an object written like the file. The object is sent
 * as JSON, which is valid YAML, so `format` checks it as it would a file.
 */
export function workflowOf(file: Record<string, unknown>): Workflow {
  const parsed = parseFile("workflow", JSON.stringify(file));
  if (!parsed.ok) {
    expect.fail(`expected the workflow to pass, got ${JSON.stringify(parsed.error)}`);
  }
  return parsed.value.value;
}

/** The workflow of the old tests (784f78d): classify a message, answer it or send it for review. */
export const triage = workflowOf({
  id: "triage",
  name: "Triage",
  initial: "classify",
  states: {
    classify: {
      agent: "classifier",
      output: "category",
      on: [
        { to: "answer", when: { equals: ["{{context.category}}", "question"] } },
        { to: "review" },
      ],
    },
    answer: { agent: "support", on: [{ to: "done" }] },
    review: {
      type: "wait",
      on: [
        { to: "done", event: "approve" },
        { to: "classify", event: "reject" },
      ],
    },
    done: { type: "final" },
  },
});
