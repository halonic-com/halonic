import { ConnectorToolError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ApprovalDesk, reviewedTools } from "../agent/listed-tool-approval.test-helper.ts";
import type { EffectBoundary } from "../agent/run-tool-call.ts";
import type { CallToolEffect } from "../kernel/decide-types.ts";
import { brokeOff } from "../kernel/requested-effect.ts";
import { ScriptedConnector } from "../testing/scripted-model.ts";
import { makeConnectorCall } from "./connector-calls.ts";

const sendingOn: EffectBoundary = { checkSending: async () => ({ allowed: true }) };

function sendMail(args: unknown): CallToolEffect {
  return {
    type: "call-tool",
    callId: "call-4",
    idempotencyKey: "run_1:call-4",
    state: "reply",
    agent: "writer",
    connector: "mail",
    tool: "send_mail",
    args,
    timeoutMs: 60_000,
  };
}

function mailConnector(answer?: () => string) {
  return new ScriptedConnector(
    "mail",
    [
      {
        name: "send_mail",
        description: "Sends a mail",
        parameters: { type: "object" },
        risk: "send",
      },
    ],
    answer,
  );
}

verifies("engine.run-connector-calls", () => {
  it("makes the call with the effect's idempotency key", async () => {
    const mail = mailConnector();

    const result = await makeConnectorCall(
      [mail],
      sendingOn,
      sendMail({ to: "support" }),
      reviewedTools,
    );

    expect(result).toMatchObject({ outcome: "ok", risk: "send" });
    expect(mail.calls).toEqual([{ name: "send_mail", args: { to: "support" } }]);
    expect(mail.idempotencyKeys).toEqual(["run_1:call-4"]);
  });

  it("doesn't make a call whose arguments aren't an object", async () => {
    const mail = mailConnector();

    const result = await makeConnectorCall([mail], sendingOn, sendMail(["support"]), reviewedTools);

    expect(result).toEqual({
      type: "tool",
      result: "The call wasn't made: the arguments of send_mail aren't an object.",
      outcome: "error",
    });
    expect(mail.calls).toEqual([]);
  });

  it("doesn't make a call to a tool that waits for approval", async () => {
    const desk = new ApprovalDesk();
    const mail = mailConnector();

    const result = await makeConnectorCall(
      [mail],
      sendingOn,
      sendMail({ to: "support" }),
      desk.gate,
    );

    expect(result).toEqual({
      type: "tool",
      result: 'The call wasn\'t made: the connector "mail" no longer offers send_mail.',
      outcome: "error",
    });
    expect(mail.calls).toEqual([]);
  });

  it("makes the call once a person approved the tool", async () => {
    const desk = new ApprovalDesk();
    const mail = mailConnector();
    await desk.approveAll(mail);

    const result = await makeConnectorCall(
      [mail],
      sendingOn,
      sendMail({ to: "support" }),
      desk.gate,
    );

    expect(result).toMatchObject({ outcome: "ok" });
    expect(mail.calls).toHaveLength(1);
  });

  it("logs a tool that answered with an error as failed, with the tool's own text (HAL-12342)", async () => {
    const mail = mailConnector(() => {
      throw new ConnectorToolError("mail", "send_mail", "ENOENT: no such file or directory\n");
    });

    const result = await makeConnectorCall(
      [mail],
      sendingOn,
      sendMail({ to: "support" }),
      reviewedTools,
    );

    expect(result).toEqual({
      type: "tool",
      result:
        'Connector "mail" says its tool "send_mail" failed. It said: ENOENT: no such file or directory',
      outcome: "error",
      risk: "send",
    });
  });

  it("keeps a call that broke off without an answer as unknown", async () => {
    const mail = mailConnector(() => {
      throw new Error("The MCP server stopped.");
    });

    const result = await makeConnectorCall(
      [mail],
      sendingOn,
      sendMail({ to: "support" }),
      reviewedTools,
    );

    expect(result).toEqual({
      type: "tool",
      result: brokeOff("The MCP server stopped."),
      outcome: "unknown",
      risk: "send",
    });
  });
});
