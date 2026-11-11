import type { AgentResume } from "@halonicjs/events";
import type { ChatResponse } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { stoppedSubagentOf } from "../kernel/stopped-subagent.ts";
import { call, callAnswer, ScriptedModel, textAnswer } from "../testing/scripted-model.ts";
import { type SubagentOutcome, subagentTools } from "../tools/subagents/subagent-tools.ts";
import type { CallChecker } from "./check-call-before-run.ts";
import { runAgentTurn } from "./run-model-turn.ts";
import type { TurnStop } from "./turn-approval.ts";
import {
  halonicTool,
  MemoryTurnLog,
  runTestTurn,
  secretsWith,
  steppingClock,
} from "./turn-test-kit.test-helper.ts";
import type { HalonicTool } from "./turn-tools.ts";

const hubAgents = {
  writer: { id: "writer", name: "Writer", subagents: ["checker"] },
  checker: { id: "checker", name: "Checker", subagents: ["reader"] },
  reader: { id: "reader", name: "Reader", subagents: [] },
};

type AgentId = keyof typeof hubAgents;

/** Asks a person about every call to `publish`; every other call runs. */
const askAboutPublish: CallChecker = (_tool, toolCall) =>
  toolCall.name === "publish" ? { kind: "ask" } : { kind: "run" };

/** Where the reader stops: before `send_mail`, which the engine makes. */
const readerStop: TurnStop = {
  type: "effect",
  connector: "mail",
  tool: "send_mail",
  args: { to: "billing@acme.example" },
  resume: {
    messages: [{ role: "user", content: "Send it" }],
    calls: [{ id: "m1", name: "send_mail", arguments: { to: "billing@acme.example" } }],
    step: 1,
  },
};

/** An agent's run turn on scripted answers, with `lookup`, `publish` and its `delegate_*` tools. */
async function agentTurn(
  agent: AgentId,
  answers: ChatResponse[],
  runSubagent: (agent: AgentId) => Promise<SubagentOutcome>,
  log?: MemoryTurnLog,
) {
  const ran: string[] = [];
  const tool = (name: string): HalonicTool =>
    halonicTool(name, async () => {
      ran.push(name);
      return `${name} done`;
    });
  const delegates = subagentTools({
    agent: hubAgents[agent],
    hubAgents,
    depth: 0,
    state: "triage",
    ...(log === undefined ? {} : { log }),
    runSubagent: (task) => runSubagent(task.agent as AgentId),
  });
  const outcome = await runAgentTurn({
    model: { provider: new ScriptedModel(answers), model: "scripted-1" },
    secrets: secretsWith(),
    messages: [{ role: "user", content: `${agent}: handle the Acme invoice` }],
    halonicTools: [tool("lookup"), tool("publish"), ...delegates],
    connectors: [],
    maxRounds: 6,
    agent,
    clock: steppingClock(),
    checkCall: askAboutPublish,
  });
  return { outcome, ran };
}

/** A subagent's outcome as `runSubagent` gives it. */
function subagentOutcome({ outcome }: Awaited<ReturnType<typeof agentTurn>>): SubagentOutcome {
  return outcome.kind === "stopped" ? outcome : { kind: "answer", content: outcome.result.content };
}

function resumeOf(outcome: Awaited<ReturnType<typeof agentTurn>>["outcome"]): AgentResume {
  if (outcome.kind !== "stopped") throw new Error("The turn didn't stop.");
  return outcome.stop.resume;
}

const delegateCall = call("d1", "delegate_checker", { task: "Check INV-7" });

verifies("engine.turn-subagent-stop", () => {
  it("stops the delegating turn where its subagent stopped, with the subagent's resume", async () => {
    const log = new MemoryTurnLog();
    const checker = await agentTurn("checker", [callAnswer(call("p1", "publish"))], async () => {
      throw new Error("the checker delegates nothing here");
    });
    const writerAnswer = callAnswer(call("c1", "lookup"), delegateCall, call("c2", "lookup"));

    const writer = await agentTurn(
      "writer",
      [writerAnswer],
      async () => subagentOutcome(checker),
      log,
    );

    expect(writer.ran).toEqual(["lookup"]);
    expect(writer.outcome).toMatchObject({
      kind: "stopped",
      stop: { type: "approval", tool: "publish", args: {} },
    });
    const resume = resumeOf(writer.outcome);
    expect(resume.calls).toEqual([
      { id: "d1", name: "delegate_checker", arguments: { task: "Check INV-7" } },
      { id: "c2", name: "lookup", arguments: {} },
    ]);
    expect(resume.inner).toEqual({ agent: "checker", resume: resumeOf(checker.outcome) });
    expect(JSON.parse(JSON.stringify(resume))).toEqual(resume);
    expect(log.events.map((event) => event.type)).toEqual(["agent.started"]);
  });

  it("nests the resume as deep as the delegation, and names the innermost subagent", async () => {
    const reader: SubagentOutcome = { kind: "stopped", stop: readerStop };
    const checker = await agentTurn(
      "checker",
      [callAnswer(call("d2", "delegate_reader", { task: "Mail the total" }))],
      async () => reader,
    );

    const writer = await agentTurn("writer", [callAnswer(delegateCall)], async () =>
      subagentOutcome(checker),
    );

    const { resume: _resume, ...why } = readerStop;
    expect(writer.outcome).toMatchObject({ kind: "stopped", stop: why });
    const resume = resumeOf(writer.outcome);
    expect(resume.inner?.agent).toBe("checker");
    expect(resume.inner?.resume.calls[0]?.name).toBe("delegate_reader");
    expect(resume.inner?.resume.inner).toEqual({ agent: "reader", resume: readerStop.resume });
    expect(stoppedSubagentOf(resume)).toEqual({ subagent: "reader" });
    expect(stoppedSubagentOf(readerStop.resume)).toEqual({});
  });

  it("doesn't go on from inside a subagent yet", async () => {
    const writer = await agentTurn("writer", [callAnswer(delegateCall)], async () => ({
      kind: "stopped",
      stop: readerStop,
    }));
    const resume = resumeOf(writer.outcome);

    const goingOn = runAgentTurn({
      model: { provider: new ScriptedModel([textAnswer("Done")]), model: "scripted-1" },
      secrets: secretsWith(),
      messages: [],
      halonicTools: [],
      connectors: [],
      maxRounds: 6,
      agent: "writer",
      clock: steppingClock(),
      resumeFrom: { resume, approved: true },
    });

    await expect(goingOn).rejects.toThrow('it stopped inside its subagent "checker"');
  });

  it("fails a chat turn whose delegate call's subagent stopped", async () => {
    const delegates = subagentTools({
      agent: hubAgents.writer,
      hubAgents,
      depth: 0,
      state: "chat",
      runSubagent: async () => ({ kind: "stopped", stop: readerStop }),
    });

    const turn = runTestTurn({
      answers: [callAnswer(delegateCall), textAnswer("Checked")],
      halonicTools: delegates,
    });

    await expect(turn).rejects.toThrow("only a run can wait for");
  });

  it("fails a delegate tool's plain run when its subagent stopped", async () => {
    const [delegate] = subagentTools({
      agent: hubAgents.writer,
      hubAgents,
      depth: 0,
      state: "chat",
      runSubagent: async () => ({ kind: "stopped", stop: readerStop }),
    });

    await expect(delegate?.run({ task: "Check INV-7" })).rejects.toThrow(
      'the "Checker" agent stopped to wait, which only a run can do',
    );
  });
});
