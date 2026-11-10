import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { EffectBoundary } from "../agent/run-tool-call.ts";
import type { CallToolEffect } from "../kernel/decide-types.ts";
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

function mailConnector() {
  return new ScriptedConnector("mail", [
    {
      name: "send_mail",
      description: "Sends a mail",
      parameters: { type: "object" },
      risk: "send",
    },
  ]);
}

verifies("engine.run-connector-calls", () => {
  it("makes the call with the effect's idempotency key", async () => {
    const mail = mailConnector();

    const result = await makeConnectorCall([mail], sendingOn, sendMail({ to: "support" }));

    expect(result).toMatchObject({ outcome: "ok", risk: "send" });
    expect(mail.calls).toEqual([{ name: "send_mail", args: { to: "support" } }]);
    expect(mail.idempotencyKeys).toEqual(["run_1:call-4"]);
  });

  it("doesn't make a call whose arguments aren't an object", async () => {
    const mail = mailConnector();

    const result = await makeConnectorCall([mail], sendingOn, sendMail(["support"]));

    expect(result).toEqual({
      type: "tool",
      result: "The call wasn't made: the arguments of send_mail aren't an object.",
      outcome: "error",
    });
    expect(mail.calls).toEqual([]);
  });
});
