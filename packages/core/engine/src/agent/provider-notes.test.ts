import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { call, callAnswer, textAnswer } from "../testing/scripted-model.ts";
import { halonicTool, MemoryTurnLog, runTestTurn } from "./turn-test-kit.test-helper.ts";

const leftOut = "Left out temperature: claude-sonnet-5-5 doesn't take it.";

verifies("engine.turn-provider-notes", () => {
  it("keeps the provider's notes on the call's llm.response", async () => {
    const log = new MemoryTurnLog();
    const { result } = await runTestTurn({
      answers: [{ ...textAnswer("Found it."), notes: [leftOut] }],
      log,
    });

    const response = log.events.find((event) => event.type === "llm.response");
    expect(response).toMatchObject({ notes: [leftOut] });
    expect(result.content).toBe("Found it.");
    expect(result.finishReason).toBe("stop");
  });

  it("keeps the notes out of the conversation", async () => {
    const log = new MemoryTurnLog();
    const lookup = halonicTool("lookup", async () => "invoice 42");
    const { model } = await runTestTurn({
      answers: [{ ...callAnswer(call("c1", "lookup")), notes: [leftOut] }, textAnswer("Done.")],
      halonicTools: [lookup],
      log,
    });

    expect(model.requests).toHaveLength(2);
    expect(JSON.stringify(model.requests[1]?.messages)).not.toContain(leftOut);
    const responses = log.events.filter((event) => event.type === "llm.response");
    expect(responses[0]).toMatchObject({ notes: [leftOut] });
    expect(responses[1]).not.toHaveProperty("notes");
  });

  it("leaves the field out for an empty list", async () => {
    const log = new MemoryTurnLog();
    await runTestTurn({ answers: [{ ...textAnswer("Found it."), notes: [] }], log });

    expect(log.events.find((event) => event.type === "llm.response")).not.toHaveProperty("notes");
  });
});
