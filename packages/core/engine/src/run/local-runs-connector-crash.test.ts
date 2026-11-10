import type { SendingSettings } from "@halonicjs/app";
import type { ChatResponse, ConnectorTool } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelBlobs, KernelRuns } from "../kernel/kernel-test-kit.test-helper.ts";
import { call, callAnswer, ScriptedConnector, textAnswer } from "../testing/scripted-model.ts";
import type { RunConnectorCalls } from "./connector-calls.ts";
import { replyStart, runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";
import { stoppedDuringCall } from "./run-connector-call-runner.ts";

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

/** The agent's answers: it calls `send_mail`, then answers `Posted`. */
const callThenPost = [
  callAnswer(call("m-1", "send_mail", { to: "support" })),
  textAnswer("Posted"),
];

/** An engine on `runs`; `answer` is what the connector does with a call. */
function engineOn(
  runs: KernelRuns,
  blobs: KernelBlobs,
  answers: ChatResponse[],
  answer?: () => Promise<string>,
) {
  const mail = new ScriptedConnector("mail", [sendMail]);
  if (answer !== undefined) mail.callTool = answer;
  return { ...runsOn(answers, runs, { connectors: [mail], connectorCalls, blobs }), mail };
}

/** Runs the first engine until the call to `send_mail` is recorded, and returns it there. */
async function recordedCall(answer?: () => Promise<string>) {
  const runs = new KernelRuns();
  const blobs = new KernelBlobs();
  const first = engineOn(runs, blobs, callThenPost, answer);
  await first.executor.start(replyStart);
  await first.scheduler.runDue();
  await first.executor.send("run_1", "approve");
  await first.scheduler.deliver("run_1", "call:call-3");
  return { runs, blobs, first };
}

verifies("engine.unknown-outcome", () => {
  it("never makes a call again after a stop between its record and the call", async () => {
    const { runs, blobs, first } = await recordedCall();
    expect(typesOf(runs.logs.get("run_1")).at(-1)).toBe("tool.called");
    // The engine stops here: the call is recorded, and its timer never arrived.
    const stale = await first.scheduler.waitFor("run_1", "tool:call-4");

    const restarted = engineOn(runs, blobs, []);
    await restarted.executor.onTimer(stale);

    expect(first.mail.calls).toEqual([]);
    expect(restarted.mail.calls).toEqual([]);
    expect(runs.logs.get("run_1")?.at(-2)).toMatchObject({
      type: "tool.result",
      outcome: "unknown",
      result: stoppedDuringCall,
    });
    expect(await runs.get("run_1")).toMatchObject({
      status: "waiting",
      accepts: ["retry", "skip"],
    });
  });

  it("waits for a person after a stop during the call, instead of ending the run", async () => {
    const { runs, blobs, first } = await recordedCall(() => new Promise<string>(() => {}));
    // The engine stops while the connector still works on the call.
    void first.scheduler.deliver("run_1", "tool:call-4");
    await first.scheduler.waitFor("run_1", "start:connector:call-4");

    const restarted = engineOn(runs, blobs, [textAnswer("Posted")]);
    await restarted.executor.send("run_1", "skip");
    await restarted.scheduler.runDue();

    expect(restarted.mail.calls).toEqual([]);
    expect(typesOf(runs.logs.get("run_1"))).not.toContain("run.failed");
    expect(restarted.model.requests[0]?.messages.at(-1)?.content).toContain(
      "may or may not have done its work",
    );
    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { reply: "Posted" },
    });
  });
});
