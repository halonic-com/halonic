import type { SendingSettings } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import type { ChatResponse, ConnectorTool } from "@halonicjs/ports";
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

/** A start error as a connector adapter throws it (`ports.connector-start-failure`). */
function startError(name: string, fields: Record<string, unknown>) {
  return Object.assign(new Error("didn't start: the program printed acme-printed-text"), {
    name,
    ...fields,
  });
}

/**
 * Runs until the writer waits for an OK on `send_mail`, then makes `mail`
 * fail to list its tools with `error`, as a connector does whose program
 * was removed or whose secret was taken away, and answers `answer`.
 */
async function approvedAfterStartFails(error: Error, answer: "approve" | "reject" = "approve") {
  const runs = new KernelRuns();
  const mail = new ScriptedConnector("mail", [sendMail]);
  const answers: ChatResponse[] = [
    callAnswer(call("m-1", "send_mail", { to: "support" })),
    textAnswer("The mail wasn't sent"),
  ];
  const engine = runsOn(answers, runs, {
    agents: agentsUsing(["mail"], "writer"),
    connectors: [mail],
    connectorCalls,
  });
  await engine.executor.start(replyStart);
  await engine.scheduler.runDue();
  mail.listTools = () => Promise.reject(error);
  await engine.executor.send("run_1", answer);
  await engine.scheduler.deliver("run_1", "call:call-3");
  return { events: runs.logs.get("run_1") ?? [], mail };
}

function ofType(events: readonly RunEvent[], ...types: string[]): RunEvent[] {
  return events.filter((event) => types.includes(event.type));
}

verifies("engine.tool-result-cause", () => {
  it("logs the approved call's result with the program that's missing, not a refusal", async () => {
    const missing = startError("ProgramNotFoundError", { program: "acme-mail-mcp" });

    const { events, mail } = await approvedAfterStartFails(missing);

    expect(ofType(events, "tool.result", "tool.refused", "tool.called")).toEqual([
      expect.objectContaining({
        type: "tool.result",
        agent: "writer",
        tool: "send_mail",
        result: `The call wasn't made: the connector "mail" didn't start.`,
        outcome: "error",
        cause: { code: "connector-not-started", why: "program-missing", name: "acme-mail-mcp" },
      }),
    ]);
    expect(mail.calls).toEqual([]);
    expect(JSON.stringify(events)).not.toContain("acme-printed-text");
  });

  it("names the secret that isn't set", async () => {
    const unset = startError("SecretNotSetError", { secretName: "mailbox-token" });

    const { events } = await approvedAfterStartFails(unset);

    expect(ofType(events, "tool.result")).toMatchObject([
      { cause: { code: "connector-not-started", why: "secret-not-set", name: "mailbox-token" } },
    ]);
  });

  it("says other when the error doesn't say why", async () => {
    const { events } = await approvedAfterStartFails(new Error("the server hung up"));

    const [result] = ofType(events, "tool.result");
    expect(result).toHaveProperty("outcome", "error");
    expect(result).toHaveProperty("cause", {
      code: "connector-not-started",
      why: "other",
    });
  });

  it("keeps a rejected call's refusal: the person said no before anything had to start", async () => {
    const missing = startError("ProgramNotFoundError", { program: "acme-mail-mcp" });

    const { events } = await approvedAfterStartFails(missing, "reject");

    expect(ofType(events, "tool.result")).toEqual([]);
  });
});
