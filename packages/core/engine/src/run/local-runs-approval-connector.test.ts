import { fenceUntrusted, type SendingSettings } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import type { ConnectorTool } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns } from "../kernel/kernel-test-kit.test-helper.ts";
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

const listingFails = () => Promise.reject(new Error("the server hung up"));

/**
 * A run whose writer lists `mail`, then `archive`, and calls `send_mail`,
 * which both list: the turn offers `mail`'s. It waits for the OK on that
 * call. Without `archive`, the writer lists only `mail`.
 */
async function waitingForOk(answer: (name: string) => string = () => "Sent", withArchive = true) {
  const runs = new KernelRuns();
  const mail = new ScriptedConnector("mail", [sendMail], answer);
  const archive = new ScriptedConnector("archive", [sendMail]);
  const connectors = withArchive ? [mail, archive] : [mail];
  const setup = runsOn(
    [callAnswer(call("m-1", "send_mail", { to: "support" })), textAnswer("Done")],
    runs,
    {
      agents: agentsUsing(
        connectors.map((connector) => connector.id),
        "writer",
      ),
      connectors,
      connectorCalls,
    },
  );
  await setup.executor.start(replyStart);
  await setup.scheduler.runDue();
  return { ...setup, mail, archive };
}

function ofType(events: readonly RunEvent[] | undefined, ...types: string[]): RunEvent[] {
  return (events ?? []).filter((event) => types.includes(event.type));
}

/** The tool message the model got for `m-1` in its last request. */
function lastResult(model: { requests: { messages: { role: string; content: string }[] }[] }) {
  return model.requests.at(-1)?.messages.find((message) => message.role === "tool")?.content;
}

verifies("engine.approval-keeps-connector", () => {
  it("asks about the call to the first connector that lists the tool", async () => {
    const { runs } = await waitingForOk();

    expect(ofType(runs.logs.get("run_1"), "approval.requested")).toMatchObject([
      { tool: "send_mail", connector: "mail" },
    ]);
  });

  it("doesn't make an approved call on another connector that lists the same tool", async () => {
    const { executor, scheduler, runs, mail, archive } = await waitingForOk();
    mail.listTools = listingFails;

    await executor.send("run_1", "approve");
    await scheduler.runDue();

    expect(archive.calls).toEqual([]);
    expect(mail.calls).toEqual([]);
    const log = runs.logs.get("run_1");
    expect(ofType(log, "effect.requested", "tool.called")).toEqual([]);
    expect(ofType(log, "tool.result")).toMatchObject([
      { tool: "send_mail", result: `The call wasn't made: the connector "mail" didn't start.` },
    ]);
  });

  it("refuses an approved call whose connector no longer lists the tool, though another does", async () => {
    const { executor, scheduler, runs, mail, archive } = await waitingForOk();
    mail.listTools = async () => [];

    await executor.send("run_1", "approve");
    await scheduler.runDue();

    expect(archive.calls).toEqual([]);
    expect(ofType(runs.logs.get("run_1"), "tool.refused")).toMatchObject([
      { tool: "send_mail", toolCallId: "m-1", reason: "not-offered" },
    ]);
  });

  it("gives the model the result of a call the engine made when the connector can't list its tools after", async () => {
    const setup = await waitingForOk(() => {
      setup.mail.listTools = listingFails;
      return "Sent";
    }, false);
    const { executor, scheduler, runs, mail, model } = setup;

    await executor.send("run_1", "approve");
    await scheduler.runDue();

    expect(mail.calls).toEqual([{ name: "send_mail", args: { to: "support" } }]);
    expect(ofType(runs.logs.get("run_1"), "tool.refused")).toEqual([]);
    expect(lastResult(model)).toBe(fenceUntrusted("Sent"));
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });
});
