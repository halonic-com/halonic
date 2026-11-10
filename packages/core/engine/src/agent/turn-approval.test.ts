import type { AgentResume } from "@halonicjs/events";
import type { ChatResponse } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { call, callAnswer, ScriptedModel, textAnswer } from "../testing/scripted-model.ts";
import type { CallChecker } from "./check-call-before-run.ts";
import { type AgentTurnOutcome, runAgentTurn, runModelTurn } from "./run-model-turn.ts";
import type { TurnAnswer } from "./turn-approval.ts";
import { halonicTool, secretsWith, steppingClock } from "./turn-test-kit.test-helper.ts";

/** Asks a person about every call to `publish`; every other call runs. */
const askAboutPublish: CallChecker = (_tool, toolCall) =>
  toolCall.name === "publish" ? { kind: "ask" } : { kind: "run" };

/** A run's turn on scripted answers, with `lookup` and `publish`, which count their runs. */
async function agentTurn(answers: ChatResponse[], resumeFrom?: TurnAnswer, maxRounds = 6) {
  const ran: string[] = [];
  const tool = (name: string) =>
    halonicTool(name, async () => {
      ran.push(name);
      return `${name} done`;
    });
  const model = new ScriptedModel(answers);
  const outcome = await runAgentTurn({
    model: { provider: model, model: "scripted-1" },
    secrets: secretsWith(),
    messages: [{ role: "user", content: "Post the Acme notice" }],
    halonicTools: [tool("lookup"), tool("publish")],
    connectors: [],
    maxRounds,
    agent: "writer",
    clock: steppingClock(),
    checkCall: askAboutPublish,
    ...(resumeFrom === undefined ? {} : { resumeFrom }),
  });
  return { model, outcome, ran };
}

const lookupThenPublish = callAnswer(
  call("c1", "lookup"),
  call("p1", "publish", { text: "Closed on Friday" }),
  call("c2", "lookup"),
);

/** The stop of a turn, as JSON read back in a new process. */
function savedStop(outcome: AgentTurnOutcome): AgentResume {
  if (outcome.kind !== "stopped") throw new Error("The turn didn't stop.");
  return JSON.parse(JSON.stringify(outcome.stop.resume)) as AgentResume;
}

verifies("engine.turn-approval-stop", () => {
  it("runs the calls before the one that asks, then stops with plain data", async () => {
    const { outcome, ran } = await agentTurn([lookupThenPublish]);

    expect(ran).toEqual(["lookup"]);
    expect(outcome).toEqual({
      kind: "stopped",
      stop: {
        type: "approval",
        tool: "publish",
        args: { text: "Closed on Friday" },
        resume: {
          messages: [
            { role: "user", content: "Post the Acme notice" },
            { role: "assistant", content: "", toolCalls: lookupThenPublish.toolCalls },
            { role: "tool", toolCallId: "c1", name: "lookup", content: "lookup done" },
          ],
          calls: [
            { id: "p1", name: "publish", arguments: { text: "Closed on Friday" } },
            { id: "c2", name: "lookup", arguments: {} },
          ],
          step: 1,
        },
      },
    });
    expect(savedStop(outcome)).toEqual(outcome.kind === "stopped" && outcome.stop.resume);
  });

  it("goes on from a saved stop: runs the approved call and the rest, then asks the model", async () => {
    const resume = savedStop((await agentTurn([lookupThenPublish])).outcome);
    const { model, outcome, ran } = await agentTurn([textAnswer("Posted")], {
      resume,
      approved: true,
    });

    expect(ran).toEqual(["publish", "lookup"]);
    expect(model.requests[0]?.messages.slice(-2)).toEqual([
      { role: "tool", toolCallId: "p1", name: "publish", content: "publish done" },
      { role: "tool", toolCallId: "c2", name: "lookup", content: "lookup done" },
    ]);
    expect(outcome).toMatchObject({ kind: "answered", result: { content: "Posted" } });
  });

  it("gives the model a rejection, with the person's comment, as the call's result", async () => {
    const resume = savedStop((await agentTurn([lookupThenPublish])).outcome);
    const { model, outcome, ran } = await agentTurn([textAnswer("Not posted")], {
      resume,
      approved: false,
      comment: "Not today",
    });

    expect(ran).toEqual(["lookup"]);
    expect(model.requests[0]?.messages.at(-2)).toEqual({
      role: "tool",
      toolCallId: "p1",
      name: "publish",
      content: "Refused: a person rejected the call and wrote: Not today",
    });
    expect(outcome.kind === "answered" && outcome.result.refusals).toEqual([
      {
        source: "halonic",
        name: "publish",
        refused: "call",
        reason: "a person rejected the call and wrote: Not today",
      },
    ]);
  });

  it("stops again at the next call that asks, and counts rounds on from the stop", async () => {
    const twoPosts = callAnswer(call("p1", "publish"), call("p2", "publish"));
    const first = savedStop((await agentTurn([twoPosts])).outcome);
    const second = await agentTurn([], { resume: first, approved: true });
    const again = savedStop(second.outcome);
    const atLimit = await agentTurn(
      [callAnswer(call("c3", "lookup"))],
      {
        resume: again,
        approved: false,
      },
      2,
    );

    expect(second.ran).toEqual(["publish"]);
    expect(again.calls.map((waiting) => waiting.id)).toEqual(["p2"]);
    expect(again.step).toBe(1);
    expect(atLimit.outcome).toMatchObject({ kind: "answered", result: { finishReason: "length" } });
  });

  it("refuses to go on from a stop that names no call", async () => {
    const resume: AgentResume = { messages: [], calls: [], step: 1 };
    await expect(agentTurn([], { resume, approved: true })).rejects.toThrow("names no call");
  });

  it("fails a chat turn whose check asks, because only a run can wait", async () => {
    const model = new ScriptedModel([callAnswer(call("p1", "publish"))]);
    const turn = runModelTurn({
      model: { provider: model, model: "scripted-1" },
      secrets: secretsWith(),
      messages: [{ role: "user", content: "Post it" }],
      callerTools: [],
      halonicTools: [halonicTool("publish", async () => "done")],
      connectors: [],
      maxRounds: 6,
      agent: "chat",
      clock: steppingClock(),
      checkCall: askAboutPublish,
    });

    await expect(turn).rejects.toThrow("which only a run can wait for");
  });
});

verifies("engine.connector-effects", () => {
  it("goes on with the result of the call the engine made, without making it again", async () => {
    const resume = savedStop((await agentTurn([lookupThenPublish])).outcome);
    const { model, outcome, ran } = await agentTurn([textAnswer("Posted")], {
      resume,
      result: "Posted on the board",
      outcome: "ok",
    });

    expect(ran).toEqual(["lookup"]);
    expect(model.requests[0]?.messages.slice(-2)).toEqual([
      { role: "tool", toolCallId: "p1", name: "publish", content: "Posted on the board" },
      { role: "tool", toolCallId: "c2", name: "lookup", content: "lookup done" },
    ]);
    expect(outcome).toMatchObject({ kind: "answered", result: { content: "Posted" } });
  });
});
