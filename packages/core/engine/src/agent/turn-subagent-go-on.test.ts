import type { AgentResume } from "@halonicjs/events";
import type { ChatMessage, ChatResponse } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  call,
  callAnswer,
  listedTool,
  ScriptedConnector,
  ScriptedModel,
  textAnswer,
} from "../testing/scripted-model.ts";
import { subagentTools } from "../tools/subagents/subagent-tools.ts";
import type { CallChecker } from "./check-call-before-run.ts";
import { type AgentTurnOutcome, runAgentTurn } from "./run-model-turn.ts";
import type { TurnAnswer } from "./turn-approval.ts";
import {
  halonicTool,
  MemoryTurnLog,
  secretsWith,
  steppingClock,
} from "./turn-test-kit.test-helper.ts";

const hubAgents = {
  writer: { id: "writer", name: "Writer", subagents: ["checker"] },
  checker: { id: "checker", name: "Checker", subagents: ["reader"] },
  reader: { id: "reader", name: "Reader", subagents: [] },
};

type AgentId = keyof typeof hubAgents;

/** Asks a person about every call to `publish`; every other call runs. */
const askAboutPublish: CallChecker = (_tool, toolCall) =>
  toolCall.name === "publish" ? { kind: "ask" } : { kind: "run" };

/**
 * A hub whose agents run real turns on scripted answers: each has `lookup`,
 * `publish`, the `mail` connector's `send_mail`, which the engine makes, and
 * its `delegate_*` tools. A new hub stands for the engine after a restart.
 */
class Hub {
  readonly log = new MemoryTurnLog();
  readonly ran: string[] = [];
  readonly mail = new ScriptedConnector("mail", [{ ...listedTool("send_mail"), risk: "write" }]);
  readonly models: Record<AgentId, ScriptedModel>;

  constructor(scripts: Partial<Record<AgentId, ChatResponse[]>>) {
    const model = (agent: AgentId) => new ScriptedModel(scripts[agent] ?? [], agent);
    this.models = { writer: model("writer"), checker: model("checker"), reader: model("reader") };
  }

  /** The writer's turn on the invoice, or going on from where it stopped. */
  writer(resumeFrom?: TurnAnswer): Promise<AgentTurnOutcome> {
    return this.turn("writer", 0, "Handle the Acme invoice", resumeFrom);
  }

  private turn(agent: AgentId, depth: number, task: string, resumeFrom?: TurnAnswer) {
    const tool = (name: string) =>
      halonicTool(name, async () => {
        this.ran.push(`${agent}:${name}`);
        return `${name} done`;
      });
    const delegates = subagentTools({
      agent: hubAgents[agent],
      hubAgents,
      depth,
      state: "triage",
      log: this.log,
      runSubagent: async (delegated) => {
        const subagent = delegated.agent as AgentId;
        const outcome = await this.turn(
          subagent,
          delegated.depth,
          delegated.task,
          delegated.resumeFrom,
        );
        return outcome.kind === "stopped"
          ? outcome
          : { kind: "answer", content: outcome.result.content };
      },
    });
    return runAgentTurn({
      model: { provider: this.models[agent], model: "scripted-1" },
      secrets: secretsWith(),
      messages: [{ role: "user", content: task }],
      halonicTools: [tool("lookup"), tool("publish"), ...delegates],
      connectors: [this.mail],
      effects: { checkSending: async () => ({ allowed: true }) },
      maxRounds: 6,
      agent,
      clock: steppingClock(),
      log: this.log,
      checkCall: askAboutPublish,
      ...(resumeFrom === undefined ? {} : { resumeFrom }),
    });
  }
}

/** The writer delegates to the checker, which delegates to the reader. */
const delegating = {
  writer: [callAnswer(call("d1", "delegate_checker", { task: "Check INV-7" }))],
  checker: [callAnswer(call("d2", "delegate_reader", { task: "Read INV-7" }))],
};

/** Where the stopped turn goes on from, as the run log gives it back after a restart. */
function savedResume(outcome: AgentTurnOutcome): AgentResume {
  if (outcome.kind !== "stopped") throw new Error("The turn didn't stop.");
  return JSON.parse(JSON.stringify(outcome.stop.resume)) as AgentResume;
}

/** The last tool message the agent's model got. */
function lastToolMessage(model: ScriptedModel): ChatMessage | undefined {
  return model.requests.at(-1)?.messages.findLast((message) => message.role === "tool");
}

/** The `agent.*` and `tool.*` events, as `<type> <agent> <tool>`. */
function agentAndToolEvents(log: MemoryTurnLog): string[] {
  return log.events
    .filter((event) => event.type.startsWith("agent.") || event.type.startsWith("tool."))
    .map((event) => [event.type, event.agent, "tool" in event ? event.tool : ""].join(" ").trim());
}

/** The writer stopped two levels deep, where the reader's model called `readerCall`. */
async function stoppedInReader(readerCall: ChatResponse) {
  const hub = new Hub({ ...delegating, reader: [readerCall] });
  return { hub, resume: savedResume(await hub.writer()) };
}

/** A new hub after a restart, on which the agents answer once the reader goes on. */
function afterRestart(reader: ChatResponse[] = [textAnswer("Read")]): Hub {
  return new Hub({
    reader,
    checker: [textAnswer("Checked")],
    writer: [textAnswer("Done")],
  });
}

verifies("engine.turn-subagent-go-on", () => {
  it("goes on in the subagent two levels deep after the OK, and answers up to the state's agent", async () => {
    const { resume } = await stoppedInReader(callAnswer(call("p1", "publish")));
    const hub = afterRestart();

    const outcome = await hub.writer({ resume, approved: true });

    expect(outcome).toMatchObject({ kind: "answered", result: { content: "Done" } });
    expect(hub.ran).toEqual(["reader:publish"]);
    expect(lastToolMessage(hub.models.checker)).toMatchObject({
      toolCallId: "d2",
      content: "Read",
    });
    expect(lastToolMessage(hub.models.writer)).toMatchObject({
      toolCallId: "d1",
      content: "Checked",
    });
    expect(agentAndToolEvents(hub.log)).toEqual([
      "tool.called reader publish",
      "tool.result reader publish",
      "agent.finished reader",
      "tool.result checker delegate_reader",
      "agent.finished checker",
      "tool.result writer delegate_checker",
    ]);
  });

  it("gives the subagent the rejection two levels deep, and runs nothing", async () => {
    const { resume } = await stoppedInReader(callAnswer(call("p1", "publish")));
    const hub = afterRestart();

    const outcome = await hub.writer({ resume, approved: false, comment: "Not yet" });

    expect(outcome).toMatchObject({ kind: "answered", result: { content: "Done" } });
    expect(hub.ran).toEqual([]);
    expect(lastToolMessage(hub.models.reader)).toMatchObject({
      toolCallId: "p1",
      content: "Refused: a person rejected the call and wrote: Not yet",
    });
  });

  it("gives the subagent the result of the call the engine made two levels deep, without making it again", async () => {
    const { resume, hub: before } = await stoppedInReader(callAnswer(call("m1", "send_mail")));
    expect(before.mail.calls).toEqual([]);
    const hub = afterRestart();

    const outcome = await hub.writer({ resume, result: "Sent", outcome: "ok" });

    expect(outcome).toMatchObject({ kind: "answered", result: { content: "Done" } });
    expect(hub.mail.calls).toEqual([]);
    expect(lastToolMessage(hub.models.reader)).toMatchObject({ toolCallId: "m1", content: "Sent" });
  });

  it("stops again where the same subagent stops again", async () => {
    const { resume } = await stoppedInReader(callAnswer(call("p1", "publish")));
    const hub = afterRestart([
      callAnswer(call("p2", "publish", { draft: false })),
      textAnswer("Read"),
    ]);

    const again = await hub.writer({ resume, approved: true });

    expect(again).toMatchObject({
      kind: "stopped",
      stop: { type: "approval", tool: "publish", args: { draft: false } },
    });
    const second = savedResume(again);
    expect(second.calls[0]?.id).toBe("d1");
    expect(second.inner?.resume.calls[0]?.id).toBe("d2");
    expect(second.inner?.resume.inner?.agent).toBe("reader");
    expect(second.inner?.resume.inner?.resume.calls[0]?.id).toBe("p2");
    expect(agentAndToolEvents(hub.log)).toEqual([
      "tool.called reader publish",
      "tool.result reader publish",
    ]);
  });

  it("keeps each level's own conversation only, so a 3-deep resume copies nothing", async () => {
    const { resume } = await stoppedInReader(callAnswer(call("p1", "publish")));
    const levels = [resume, resume.inner?.resume, resume.inner?.resume.inner?.resume];

    expect(levels.map((level) => level?.messages[0])).toEqual([
      { role: "user", content: "Handle the Acme invoice" },
      { role: "user", content: "Check INV-7" },
      { role: "user", content: "Read INV-7" },
    ]);
    for (const [index, level] of levels.entries()) {
      const above = levels[index - 1]?.messages ?? [];
      const own = new Set(level?.messages.map((message) => JSON.stringify(message)));
      expect(above.filter((message) => own.has(JSON.stringify(message)))).toEqual([]);
    }
  });

  it("refuses to go on in a subagent its delegate tool doesn't hand tasks to", async () => {
    const [delegate] = subagentTools({
      agent: hubAgents.writer,
      hubAgents,
      depth: 0,
      state: "triage",
      runSubagent: async () => ({ kind: "answer", content: "Checked" }),
    });
    const { resume } = await stoppedInReader(callAnswer(call("p1", "publish")));

    await expect(
      delegate?.goOn?.({ task: "Check INV-7" }, "reader", { resume, approved: true }),
    ).rejects.toThrow('the "reader" agent stopped in a call that delegates to "checker"');
  });
});
