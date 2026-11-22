import type { WorkflowDefinition } from "@halonicjs/app";
import type { RunSends } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { plainText } from "../../messages/phrase.ts";
import { clock, noToolCalls, runOf, started, today } from "../../test/listed-run-fixtures.ts";
import { listedRun } from "./listed-run.ts";

/** Support reply with an approval and two endings, as Acme's has. */
const twoEndings = {
  version: 1,
  id: "support-reply",
  name: "Support reply",
  initial: "review",
  context: {},
  layout: {},
  states: {
    review: { type: "wait", description: "Approve this reply?" },
    replied: { type: "final", description: "Finished with the reply approved" },
    "not-replied": { type: "final", description: "Finished without the reply\nNothing was sent." },
  },
} as unknown as WorkflowDefinition;

/** The What column of a run that completed in `finalState`, with `sends` and `cost`. */
function whatOf(finalState: string, sends: RunSends, cost = 0): string {
  const summary = runOf(
    [
      started,
      {
        type: "llm.response",
        agent: "writer",
        provider: "anthropic",
        model: "smart",
        usage: { inputTokens: 10, outputTokens: 10 },
        latencyMs: 900,
        text: "Hello",
        cost,
      },
      { type: "state.entered", state: finalState },
      { type: "run.completed", state: finalState, context: {} },
    ],
    today,
  );
  const listed = listedRun({ summary, sends }, () => twoEndings, clock);
  expect(listed.status).toBe("done");
  return plainText(listed.what);
}

verifies("cli.run-ending", () => {
  it("lists a rejected run with the ending it reached first, so it doesn't read as sent (C705 1)", () => {
    expect(whatOf("not-replied", noToolCalls)).toBe(
      "Ending: Finished without the reply · sent nothing",
    );
  });

  it("adds the estimated cost after the ending", () => {
    expect(whatOf("replied", noToolCalls, 0.02)).toBe(
      "Ending: Finished with the reply approved · sent nothing · estimated cost €0.02",
    );
  });

  it("says only the ending when the run's tool calls sent nothing and it had no priced call", () => {
    expect(whatOf("replied", { sent: [], maySend: [], madeToolCalls: true })).toBe(
      "Ending: Finished with the reply approved",
    );
  });
});
