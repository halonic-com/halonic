import type { WorkflowDefinition } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { plainText } from "../../messages/phrase.ts";
import { runOf, started } from "../../test/listed-run-fixtures.ts";
import { showEnding } from "./show-ending.ts";

/** A workflow whose final states are `finals`, each described as its value. */
function workflowWith(finals: Readonly<Record<string, string>>): WorkflowDefinition {
  const states = Object.fromEntries(
    Object.entries(finals).map(([id, description]) => [id, { type: "final", description }]),
  );
  return {
    version: 1,
    id: "support-reply",
    name: "Support reply",
    initial: "review",
    context: {},
    layout: {},
    states: { review: { type: "wait", description: "Approve this reply?" }, ...states },
  } as unknown as WorkflowDefinition;
}

/** The plain lines a run that completed in `finalState` ends with. */
function endingLines(workflow: WorkflowDefinition, finalState: string): string[] {
  const summary = runOf(
    [
      started,
      { type: "state.entered", state: finalState },
      { type: "run.completed", state: finalState, context: {} },
    ],
    "2026-11-09T10:30:00.000Z",
  );
  const lines = showEnding(
    { summary, events: [] },
    "Support reply",
    { workflow, agent: () => undefined },
    () => {
      throw new Error("Only a failed run reads the models.");
    },
    undefined,
  );
  return lines.map(plainText);
}

verifies("cli.run-ending", () => {
  it("names the ending a run reached when its workflow has more than one", () => {
    const workflow = workflowWith({
      replied: "Finished with the reply approved",
      "not-replied": "Finished without the reply\nNothing was sent.",
    });

    expect(endingLines(workflow, "not-replied").at(-1)).toBe(
      "  Ending: Finished without the reply",
    );
  });

  it("names it by its id when it has no description", () => {
    const workflow = workflowWith({ replied: "", "not-replied": "" });

    expect(endingLines(workflow, "not-replied").at(-1)).toBe("  Ending: Not-replied");
  });

  it("has no Ending line for a workflow with one final state", () => {
    const lines = endingLines(workflowWith({ done: "Finished" }), "done");

    expect(lines.join("\n")).not.toContain("Ending:");
    expect(lines).toContainEqual(expect.stringMatching(/^✓ Support reply finished in /));
  });
});
