import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { reviewedTools } from "../agent/listed-tool-approval.test-helper.ts";
import type { EffectBoundary } from "../agent/run-tool-call.ts";
import type { CallToolEffect } from "../kernel/decide-types.ts";
import { ScriptedConnector } from "../testing/scripted-model.ts";
import { makeConnectorCall, makeRunConnectorCall } from "./connector-calls.ts";
import { noConnectorCalls } from "./run-connector-call-runner.ts";

const sendingOn: EffectBoundary = { checkSending: async () => ({ allowed: true }) };
const sendingOff: EffectBoundary = {
  checkSending: async () => ({ allowed: false, reason: 'sending is off for the connector "mail"' }),
};

function callOf(tool: string, args: unknown): CallToolEffect {
  return {
    type: "call-tool",
    callId: "call-4",
    idempotencyKey: "run_1:call-4",
    state: "reply",
    agent: "writer",
    connector: "mail",
    tool,
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

const sendMail = callOf("send_mail", { to: "support" });

verifies("engine.tool-result-cause", () => {
  describe("a call the engine doesn't make", () => {
    it("says the connector isn't connected", async () => {
      const result = await makeConnectorCall([], sendingOn, sendMail, reviewedTools);

      expect(result.cause).toEqual({ code: "not-made", why: "not-connected" });
    });

    it("says the tool is gone", async () => {
      const call = callOf("archive_mail", {});
      const result = await makeConnectorCall([mailConnector()], sendingOn, call, reviewedTools);

      expect(result.cause).toEqual({ code: "not-made", why: "tool-gone" });
    });

    it("says sending is off, and the model still hears the check's reason", async () => {
      const result = await makeConnectorCall(
        [mailConnector()],
        sendingOff,
        sendMail,
        reviewedTools,
      );

      expect(result).toMatchObject({
        outcome: "error",
        result: 'The call wasn\'t made: sending is off for the connector "mail".',
        cause: { code: "not-made", why: "sending-off" },
      });
    });

    it("says the arguments aren't an object", async () => {
      const call = callOf("send_mail", ["support"]);
      const result = await makeConnectorCall([mailConnector()], sendingOn, call, reviewedTools);

      expect(result.cause).toEqual({ code: "not-made", why: "bad-arguments" });
    });

    it("says the connector isn't connected on an engine that makes no connector calls", async () => {
      expect((await noConnectorCalls(sendMail, undefined as never)).cause).toEqual({
        code: "not-made",
        why: "not-connected",
      });
    });
  });

  it("says the connectors didn't start, and keeps the error's message out of the cause", async () => {
    const secretValue = "invented-token-0000";
    const open = async () => {
      throw new Error(`mail exited: bad key ${secretValue}`);
    };

    const result = await makeRunConnectorCall(open, sendingOn, sendMail, reviewedTools);

    expect(result.outcome).toBe("error");
    expect(result.cause).toStrictEqual({ code: "connector-not-started", why: "other" });
    expect(JSON.stringify(result.cause)).not.toContain(secretValue);
  });

  it("gives no cause to a call that was made", async () => {
    const result = await makeConnectorCall([mailConnector()], sendingOn, sendMail, reviewedTools);

    expect(result.outcome).toBe("ok");
    expect(result).not.toHaveProperty("cause");
  });

  it("gives no cause to a call whose connector failed", async () => {
    const mail = mailConnector();
    mail.callTool = async () => {
      throw new Error("the mail server hung up");
    };

    const result = await makeConnectorCall([mail], sendingOn, sendMail, reviewedTools);

    expect(result.outcome).toBe("unknown");
    expect(result).not.toHaveProperty("cause");
  });
});
