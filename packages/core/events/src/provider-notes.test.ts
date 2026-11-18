import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import { providerNotes } from "./provider-notes.ts";
import type { RunEventBody } from "./run-event.ts";
import { runLog } from "./summarize.test-helper.ts";

type LlmResponse = Extract<RunEventBody, { type: "llm.response" }>;

const leftOutTemperature = "Left out temperature: claude-sonnet-5-5 doesn't take it.";
const leftOutTopP = "Left out top_p: claude-sonnet-5-5 doesn't take it.";

function response(notes?: string[]): LlmResponse {
  return {
    type: "llm.response",
    agent: "writer",
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    usage: { inputTokens: 10, outputTokens: 5 },
    latencyMs: 300,
    text: "Hello",
    ...(notes === undefined ? {} : { notes }),
  };
}

verifies("events.provider-notes", () => {
  typeTest("keeps the notes as an optional list of sentences", () => {
    expectTypeOf<LlmResponse["notes"]>().toEqualTypeOf<string[] | undefined>();
  });

  it("lists each note once, in the order each first came", () => {
    const log = runLog(
      response([leftOutTemperature]),
      response([leftOutTemperature, leftOutTopP]),
      response([leftOutTemperature]),
    );
    expect(providerNotes(log)).toEqual([leftOutTemperature, leftOutTopP]);
  });

  it("lists none when no call has notes", () => {
    expect(providerNotes(runLog(response(), response([])))).toEqual([]);
  });
});
