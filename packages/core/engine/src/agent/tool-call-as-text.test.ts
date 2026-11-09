import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  call,
  callAnswer,
  listedTool,
  ScriptedConnector,
  textAnswer,
} from "../testing/scripted-model.ts";
import { callerTool, MemoryTurnLog, runTestTurn } from "./turn-test-kit.test-helper.ts";

const writtenCall = '{"name": "lookup", "arguments": {"q": "acme"}}';

/** Runs a turn whose model answers with `text`, offering the `lookup` tool of a mail server. */
async function answerWith(text: string) {
  const mail = new ScriptedConnector("mail", [listedTool("lookup")]);
  const log = new MemoryTurnLog();
  const { result } = await runTestTurn({ answers: [textAnswer(text)], connectors: [mail], log });
  const response = log.events.find((event) => event.type === "llm.response");
  return { mail, result, response };
}

verifies("engine.turn-tool-call-as-text", () => {
  it("marks a tool call written in a code fence, and never runs it", async () => {
    const text = `\`\`\`json\n${writtenCall}\n\`\`\``;
    const { mail, result, response } = await answerWith(text);

    expect(response).toMatchObject({ toolCallAsText: true });
    expect(mail.calls).toEqual([]);
    expect(result.content).toBe(text);
    expect(result.finishReason).toBe("stop");
  });

  it("marks a tool call written as the whole answer", async () => {
    const { response } = await answerWith(`  ${writtenCall}\n`);
    expect(response).toMatchObject({ toolCallAsText: true });
  });

  it.each([
    ["names a tool that wasn't offered", '{"name": "delete", "arguments": {}}'],
    ["has no arguments", '{"name": "lookup"}'],
    ["isn't JSON", "{ name: lookup }"],
    ["is JSON but not an object", "[1, 2]"],
    ["is prose", 'I would call lookup with {"q": "acme"}.'],
  ])("leaves an answer unmarked that %s", async (_why, text) => {
    const { response } = await answerWith(text);
    expect(response).not.toHaveProperty("toolCallAsText");
  });

  it("leaves an answer unmarked that made a real tool call", async () => {
    const log = new MemoryTurnLog();
    const answer = {
      ...callAnswer(call("c1", "pick")),
      content: '{"name": "pick", "arguments": {}}',
    };

    await runTestTurn({ answers: [answer], callerTools: [callerTool("pick")], log });

    expect(log.events.find((event) => event.type === "llm.response")).not.toHaveProperty(
      "toolCallAsText",
    );
  });
});
