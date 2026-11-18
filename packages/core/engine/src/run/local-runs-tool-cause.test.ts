import type { SendingSettings } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import type { ChatResponse, ConnectorTool } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelBlobs, KernelRuns } from "../kernel/kernel-test-kit.test-helper.ts";
import { call, callAnswer, ScriptedConnector, textAnswer } from "../testing/scripted-model.ts";
import type { RunConnectorCalls } from "./connector-calls.ts";
import { agentsUsing, replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";

const sendMail: ConnectorTool = {
  name: "send_mail",
  description: "Sends a mail",
  parameters: { type: "object", properties: { to: { type: "string" } } },
  risk: "send",
};

const sending: SendingSettings = { checkSending: async () => ({ allowed: true }) };
const connectorCalls: RunConnectorCalls = {
  location: "/workspaces/acme",
  sending,
  reportSettingsError: () => {},
};

/** An engine on `runs` whose agent calls `send_mail`, then answers `Posted`; `answer` is what `mail` does with a call. */
function engineOn(
  runs: KernelRuns,
  blobs: KernelBlobs,
  answers: ChatResponse[],
  answer?: () => Promise<string>,
) {
  const mail = new ScriptedConnector("mail", [sendMail]);
  if (answer !== undefined) mail.callTool = answer;
  return runsOn(answers, runs, {
    agents: agentsUsing(["mail"], "writer"),
    connectors: [mail],
    connectorCalls,
    blobs,
  });
}

/** Runs an engine until the approved call to `send_mail` is recorded and its `tool:call-4` timer is due. */
async function recordedCall(answer: () => Promise<string>) {
  const runs = new KernelRuns();
  const blobs = new KernelBlobs();
  const answers = [callAnswer(call("m-1", "send_mail", { to: "support" })), textAnswer("Posted")];
  const engine = engineOn(runs, blobs, answers, answer);
  await engine.executor.start(replyStart);
  await engine.scheduler.runDue();
  await engine.executor.send("run_1", "approve");
  await engine.scheduler.deliver("run_1", "call:call-3");
  return { runs, blobs, engine };
}

function toolResults(events: readonly RunEvent[] | undefined): RunEvent[] {
  return (events ?? []).filter((event) => event.type === "tool.result");
}

const neverAnswers = () => new Promise<string>(() => {});

verifies("engine.tool-result-cause", () => {
  it("logs the time limit when the connector doesn't answer within it", async () => {
    const { runs, engine } = await recordedCall(neverAnswers);

    const calling = engine.scheduler.deliver("run_1", "tool:call-4");
    await engine.scheduler.deliver("run_1", "start:connector:call-4");
    await calling;

    expect(toolResults(runs.logs.get("run_1"))).toMatchObject([
      {
        outcome: "unknown",
        result: expect.stringContaining("took longer than 60 seconds"),
        cause: { code: "time-limit", seconds: 60 },
      },
    ]);
  });

  it("logs no cause when the connector fails within the limit", async () => {
    const { runs, engine } = await recordedCall(async () => {
      throw new Error("the mail server hung up");
    });

    await engine.scheduler.deliver("run_1", "tool:call-4");

    const results = toolResults(runs.logs.get("run_1"));
    expect(results).toMatchObject([{ outcome: "unknown" }]);
    expect(results[0]).not.toHaveProperty("cause");
  });

  it("logs that the engine stopped during the call", async () => {
    const { runs, blobs, engine } = await recordedCall(neverAnswers);
    // The engine stops while the connector still works on the call.
    void engine.scheduler.deliver("run_1", "tool:call-4");
    await engine.scheduler.waitFor("run_1", "start:connector:call-4");

    const restarted = engineOn(runs, blobs, []);
    await restarted.executor.send("run_1", "skip");

    expect(toolResults(runs.logs.get("run_1"))).toMatchObject([
      { outcome: "unknown", cause: { code: "engine-stopped" } },
    ]);
  });
});
