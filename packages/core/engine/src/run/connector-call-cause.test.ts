import { maxCauseNameLength } from "@halonicjs/events";
import type { Connector } from "@halonicjs/format";
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

/** `mail`'s file, with no `allow`: every tool its server lists is offered. */
const allMail: Readonly<Record<string, Connector["tools"]>> = { mail: { approve: [] } };

const sendMail = callOf("send_mail", { to: "support" });

/** A start error as a connector adapter throws it (`ports.connector-start-failure`). */
function startError(name: string, fields: Record<string, unknown>, message = "didn't start") {
  return Object.assign(new Error(message), { name, ...fields });
}

verifies("engine.tool-result-cause", () => {
  describe("a call the engine doesn't make", () => {
    it("says the connector isn't connected", async () => {
      const result = await makeConnectorCall([], allMail, sendingOn, sendMail, reviewedTools);

      expect(result.cause).toEqual({ code: "not-made", why: "not-connected" });
    });

    it("says the tool is gone", async () => {
      const call = callOf("archive_mail", {});
      const result = await makeConnectorCall(
        [mailConnector()],
        allMail,
        sendingOn,
        call,
        reviewedTools,
      );

      expect(result.cause).toEqual({ code: "not-made", why: "tool-gone" });
    });

    it("says sending is off, and the model still hears the check's reason", async () => {
      const result = await makeConnectorCall(
        [mailConnector()],
        allMail,
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
      const result = await makeConnectorCall(
        [mailConnector()],
        allMail,
        sendingOn,
        call,
        reviewedTools,
      );

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

    const result = await makeRunConnectorCall(open, {}, sendingOn, sendMail, reviewedTools);

    expect(result.outcome).toBe("error");
    expect(result.cause).toStrictEqual({ code: "connector-not-started", why: "other" });
    expect(JSON.stringify(result.cause)).not.toContain(secretValue);
  });

  describe("names why the connectors didn't start", () => {
    it("names the program that isn't on this computer", async () => {
      const open = async () => {
        throw startError("ProgramNotFoundError", { program: "npx" });
      };

      const result = await makeRunConnectorCall(open, {}, sendingOn, sendMail, reviewedTools);

      expect(result.outcome).toBe("error");
      expect(result.cause).toStrictEqual({
        code: "connector-not-started",
        why: "program-missing",
        name: "npx",
      });
    });

    it("names the secret that isn't set, and nothing of the error's message", async () => {
      const mail = mailConnector();
      mail.listTools = async () => {
        throw startError(
          "SecretNotSetError",
          { secretName: "MAIL_TOKEN" },
          "invented-token-0000 in the profile folder",
        );
      };

      const result = await makeConnectorCall([mail], allMail, sendingOn, sendMail, reviewedTools);

      expect(result.outcome).toBe("error");
      expect(result.cause).toStrictEqual({
        code: "connector-not-started",
        why: "secret-not-set",
        name: "MAIL_TOKEN",
      });
      expect(JSON.stringify(result.cause)).not.toContain("invented-token-0000");
      expect(mail.calls).toEqual([]);
    });

    it("says `other` when the listing failed for a reason it can't name", async () => {
      const mail = mailConnector();
      mail.listTools = async () => {
        throw new Error("mail exited");
      };

      const result = await makeConnectorCall([mail], allMail, sendingOn, sendMail, reviewedTools);

      expect(result.cause).toStrictEqual({ code: "connector-not-started", why: "other" });
    });

    it("cuts a long name to the longest a cause carries", async () => {
      const open = async () => {
        throw startError("ProgramNotFoundError", { program: "p".repeat(maxCauseNameLength + 5) });
      };

      const result = await makeRunConnectorCall(open, {}, sendingOn, sendMail, reviewedTools);

      expect(result.cause).toMatchObject({ name: "p".repeat(maxCauseNameLength) });
    });
  });

  it("gives no cause to a call that was made", async () => {
    const result = await makeConnectorCall(
      [mailConnector()],
      allMail,
      sendingOn,
      sendMail,
      reviewedTools,
    );

    expect(result.outcome).toBe("ok");
    expect(result).not.toHaveProperty("cause");
  });

  it("gives no cause to a call whose connector failed", async () => {
    const mail = mailConnector();
    mail.callTool = async () => {
      throw new Error("the mail server hung up");
    };

    const result = await makeConnectorCall([mail], allMail, sendingOn, sendMail, reviewedTools);

    expect(result.outcome).toBe("unknown");
    expect(result).not.toHaveProperty("cause");
  });
});
