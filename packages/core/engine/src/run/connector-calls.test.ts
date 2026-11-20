import type { Connector } from "@halonicjs/format";
import { type ConnectorTool, ConnectorToolError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ApprovalDesk, reviewedTools } from "../agent/listed-tool-approval.test-helper.ts";
import type { EffectBoundary } from "../agent/run-tool-call.ts";
import type { CallToolEffect } from "../kernel/decide-types.ts";
import { brokeOff } from "../kernel/requested-effect.ts";
import { ScriptedConnector } from "../testing/scripted-model.ts";
import { makeConnectorCall } from "./connector-calls.ts";

const sendingOn: EffectBoundary = { checkSending: async () => ({ allowed: true }) };

type Lists = Readonly<Record<string, Connector["tools"]>>;

/** `mail`'s file, with no `allow`: every tool its server lists is offered. */
const allMail: Lists = { mail: { approve: [] } };

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
      allMail,
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

    const result = await makeConnectorCall(
      [mail],
      allMail,
      sendingOn,
      sendMail(["support"]),
      reviewedTools,
    );

    expect(result).toEqual({
      type: "tool",
      result: "The call wasn't made: the arguments of send_mail aren't an object.",
      outcome: "error",
      cause: { code: "not-made", why: "bad-arguments" },
    });
    expect(mail.calls).toEqual([]);
  });

  it("doesn't make a call to a tool that waits for approval", async () => {
    const desk = new ApprovalDesk();
    const mail = mailConnector();

    const result = await makeConnectorCall(
      [mail],
      allMail,
      sendingOn,
      sendMail({ to: "support" }),
      desk.gate,
    );

    expect(result).toEqual({
      type: "tool",
      result: 'The call wasn\'t made: the connector "mail" no longer offers send_mail.',
      outcome: "error",
      cause: { code: "not-made", why: "tool-gone" },
    });
    expect(mail.calls).toEqual([]);
  });

  it("makes the call once a person approved the tool", async () => {
    const desk = new ApprovalDesk();
    const mail = mailConnector();
    await desk.approveAll(mail);

    const result = await makeConnectorCall(
      [mail],
      allMail,
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
      allMail,
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
      allMail,
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

verifies("engine.run-connector-allow", () => {
  function fileTool(name: string): ConnectorTool {
    return {
      name,
      description: `Does ${name}`,
      parameters: { type: "object", properties: {} },
      risk: "read",
    };
  }

  function readText(tool = "read_text_file"): CallToolEffect {
    return { ...sendMail({ path: "handbook.md" }), connector: "handbook-files", tool };
  }

  /** The recipe's file: only `read_text_file` is offered to agents. */
  const onlyReadText: Lists = { "handbook-files": { allow: ["read_text_file"], approve: [] } };

  /** The handbook's server, with `read_text_file` approved and its other tools not. */
  async function handbook(desk: ApprovalDesk) {
    await desk.approveAll(new ScriptedConnector("handbook-files", [fileTool("read_text_file")]));
    return new ScriptedConnector("handbook-files", [
      fileTool("read_text_file"),
      fileTool("read_file"),
      fileTool("write_file"),
    ]);
  }

  it("makes a call to an allowed tool without telling the person about tools `allow` leaves out", async () => {
    const desk = new ApprovalDesk();
    const files = await handbook(desk);

    const result = await makeConnectorCall([files], onlyReadText, sendingOn, readText(), desk.gate);

    expect(result).toMatchObject({ outcome: "ok" });
    expect(files.calls).toEqual([{ name: "read_text_file", args: { path: "handbook.md" } }]);
    expect(desk.heard).toEqual([]);
  });

  it("doesn't make a call to a tool `allow` leaves out, even once a person approved it", async () => {
    const desk = new ApprovalDesk();
    const files = await handbook(desk);
    await desk.approveAll(files);

    const result = await makeConnectorCall(
      [files],
      onlyReadText,
      sendingOn,
      readText("write_file"),
      desk.gate,
    );

    expect(result).toEqual({
      type: "tool",
      result: 'The call wasn\'t made: the connector "handbook-files" no longer offers write_file.',
      outcome: "error",
      cause: { code: "not-made", why: "tool-gone" },
    });
    expect(files.calls).toEqual([]);
  });

  it("doesn't make a call to a connector whose file isn't in the run's kept definitions", async () => {
    const mail = mailConnector();

    const result = await makeConnectorCall(
      [mail],
      {},
      sendingOn,
      sendMail({ to: "support" }),
      reviewedTools,
    );

    expect(result).toEqual({
      type: "tool",
      result: "The call wasn't made: the connector \"mail\" isn't connected.",
      outcome: "error",
      cause: { code: "not-made", why: "not-connected" },
    });
    expect(mail.calls).toEqual([]);
  });
});
