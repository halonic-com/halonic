// A failed integration call gets a `service-refused` cause from Halonic's own
// log of that call's requests (HAL-19185). The connector here is scripted: it
// fails with the requests on its error as the integration runner puts them
// there (`integration-runner.call-requests-log`).

import type { RunEvent } from "@halonicjs/events";
import type { Connector } from "@halonicjs/format";
import type { ConnectorCallRequest, ConnectorTool } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { reviewedTools } from "../agent/listed-tool-approval.test-helper.ts";
import type { EffectBoundary } from "../agent/run-tool-call.ts";
import type { CallToolEffect } from "../kernel/decide-types.ts";
import { KernelBlobs, KernelRuns } from "../kernel/kernel-test-kit.test-helper.ts";
import { call, callAnswer, ScriptedConnector, textAnswer } from "../testing/scripted-model.ts";
import { makeConnectorCall, type RunConnectorCalls } from "./connector-calls.ts";
import { agentsUsing, replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";

const secretCanary = "invented-token-1111";
const replyCanary = "reply-canary-a41b";

const sendMail: ConnectorTool = {
  name: "send_mail",
  description: "Sends a mail",
  parameters: { type: "object", properties: { to: { type: "string" } } },
  risk: "send",
};

const sendingOn: EffectBoundary = { checkSending: async () => ({ allowed: true }) };
const allMail: Readonly<Record<string, Connector["tools"]>> = { mail: { approve: [] } };

const sendCall: CallToolEffect = {
  type: "call-tool",
  callId: "call-4",
  idempotencyKey: "run_1:call-4",
  state: "reply",
  agent: "writer",
  connector: "mail",
  tool: "send_mail",
  args: { to: "support" },
  timeoutMs: 60_000,
};

/** A request of the call, as Halonic's log has it. */
function request(
  method: string,
  status: number | undefined,
  fields: Partial<ConnectorCallRequest> = {},
): ConnectorCallRequest {
  return {
    method,
    host: "api.example.com",
    path: "/v1/messages",
    ...(status === undefined ? {} : { status }),
    ...fields,
  };
}

/** The error an integration call fails with, carrying its requests. */
function failedWith(requests: readonly ConnectorCallRequest[], message = "The service said no.") {
  return Object.assign(new Error(message), { name: "RunnerToolError", callRequests: requests });
}

/** `mail`, whose `send_mail` fails with `requests` on its error. */
function mailFailing(requests: readonly ConnectorCallRequest[]): ScriptedConnector {
  const mail = new ScriptedConnector("mail", [sendMail]);
  mail.callTool = async () => {
    throw failedWith(requests);
  };
  return mail;
}

/** The result of one call to `send_mail` on `mail`. */
function callOn(mail: ScriptedConnector) {
  return makeConnectorCall([mail], allMail, sendingOn, sendCall, reviewedTools);
}

const connectorCalls: RunConnectorCalls = {
  location: "/workspaces/acme",
  sending: { checkSending: async () => ({ allowed: true }) },
  reportSettingsError: () => {},
};

/** Runs an engine whose agent calls `send_mail` on `mail`, and gives its `tool.result` events. */
async function loggedResults(mail: ScriptedConnector): Promise<RunEvent[]> {
  const runs = new KernelRuns();
  const answers = [callAnswer(call("m-1", "send_mail", { to: "support" })), textAnswer("Posted")];
  const engine = runsOn(answers, runs, {
    agents: agentsUsing(["mail"], "writer"),
    connectors: [mail],
    connectorCalls,
    blobs: new KernelBlobs(),
  });
  await engine.executor.start(replyStart);
  await engine.scheduler.runDue();
  await engine.executor.send("run_1", "approve");
  await engine.scheduler.deliver("run_1", "call:call-3");
  await engine.scheduler.deliver("run_1", "tool:call-4");
  return (runs.logs.get("run_1") ?? []).filter((event) => event.type === "tool.result");
}

verifies("engine.tool-result-cause", () => {
  describe("a call whose last and only request was refused", () => {
    const cases = [
      { status: 401, cause: { why: "not-accepted" } },
      { status: 403, cause: { why: "not-allowed" } },
      { status: 429, cause: { why: "slow-down", retries: 0 } },
    ];
    for (const { status, cause } of cases) {
      it(`logs ${status} as outcome error with why ${cause.why}`, async () => {
        const results = await loggedResults(mailFailing([request("POST", status)]));

        expect(results).toMatchObject([
          {
            outcome: "error",
            cause: { code: "service-refused", ...cause, sentOnce: true },
          },
        ]);
      });
    }

    it("logs how many times Halonic tried a 429 again", async () => {
      const result = await callOn(mailFailing([request("GET", 429, { retry: 2 })]));

      expect(result).toMatchObject({
        outcome: "error",
        cause: { code: "service-refused", why: "slow-down", retries: 2 },
      });
    });
  });

  it("keeps the outcome unknown when an earlier POST got through, with the cause", async () => {
    const result = await callOn(mailFailing([request("POST", 200), request("GET", 429)]));

    expect(result.outcome).toBe("unknown");
    expect(result.result).toContain("may or may not have done its work");
    expect(result.cause).toStrictEqual({
      code: "service-refused",
      why: "slow-down",
      retries: 0,
      sentOnce: true,
    });
  });

  it("keeps the outcome unknown when an earlier POST broke off without an answer", async () => {
    const result = await callOn(mailFailing([request("POST", undefined), request("GET", 429)]));

    expect(result.outcome).toBe("unknown");
    expect(result.cause).toStrictEqual({
      code: "service-refused",
      why: "slow-down",
      retries: 0,
      sentOnce: true,
    });
  });

  it("counts an earlier POST the kit refused as never sent", async () => {
    const refused = request("POST", undefined, { refusal: "secret-in-request" });

    const result = await callOn(mailFailing([refused, request("GET", 429)]));

    expect(result).toMatchObject({ outcome: "error", cause: { why: "slow-down" } });
  });

  it("logs unknown with no cause when the error carries no requests", async () => {
    const mail = new ScriptedConnector("mail", [sendMail]);
    mail.callTool = async () => {
      throw Object.assign(new Error("Too many requests."), { name: "RunnerToolError" });
    };

    const result = await callOn(mail);

    expect(result.outcome).toBe("unknown");
    expect(result).not.toHaveProperty("cause");
  });

  it("logs an error when only GET requests got through before the refusal", async () => {
    const result = await callOn(mailFailing([request("GET", 200), request("POST", 403)]));

    expect(result).toMatchObject({ outcome: "error", cause: { why: "not-allowed" } });
  });

  describe("a host the sheet doesn't declare", () => {
    const hosts: [string, string][] = [
      ["shopify.com.example.net", "example.net"],
      ["api.example.co.uk", "example.co.uk"],
      ["192.0.2.7", "192.0.2.7"],
      ["[2001:db8::1]", "[2001:db8::1]"],
      ["localhost", "localhost"],
      ["shop.xn--bcher-kva.example", "xn--bcher-kva.example"],
    ];
    for (const [host, shown] of hosts) {
      it(`logs ${host} as ${shown}`, async () => {
        const refused = request("POST", undefined, { host, refusal: "host-not-allowed" });

        const result = await callOn(mailFailing([refused]));

        expect(result).toMatchObject({
          outcome: "error",
          cause: { code: "service-refused", why: "host-not-declared", host: shown },
        });
      });
    }
  });

  it("gives no cause when the last request got a 200", async () => {
    const result = await callOn(mailFailing([request("GET", 429), request("GET", 200)]));

    expect(result.outcome).toBe("unknown");
    expect(result).not.toHaveProperty("cause");
  });

  it("gives no cause for a refusal the kit made for another reason", async () => {
    const result = await callOn(
      mailFailing([request("POST", undefined, { refusal: "secret-in-request" })]),
    );

    expect(result).not.toHaveProperty("cause");
  });

  it("never gives two overlapping calls each other's cause", async () => {
    const mail = new ScriptedConnector("mail", [sendMail]);
    let calls = 0;
    mail.callTool = async () => {
      const first = calls === 0;
      calls += 1;
      // The first call ends after the second, so a shared log would give it the 403.
      await new Promise((resolve) => setTimeout(resolve, first ? 20 : 0));
      throw failedWith([request("GET", first ? 429 : 403)]);
    };

    const [slow, forbidden] = await Promise.all([callOn(mail), callOn(mail)]);

    expect(slow.cause).toMatchObject({ why: "slow-down" });
    expect(forbidden.cause).toMatchObject({ why: "not-allowed" });
  });

  describe("sentOnce", () => {
    it("is true for a POST sent once", async () => {
      const result = await callOn(mailFailing([request("GET", 200), request("POST", 429)]));

      expect(result.cause).toMatchObject({ sentOnce: true });
    });

    it("is absent when the integration's code sent the same POST twice", async () => {
      const result = await callOn(mailFailing([request("POST", 500), request("POST", 429)]));

      expect(result.cause).toStrictEqual({ code: "service-refused", why: "slow-down", retries: 0 });
    });
  });

  it("logs neither a secret nor the reply that reached Halonic's side", async () => {
    const leaky = {
      ...request("POST", 401, { path: `/v1/${secretCanary}` }),
      body: replyCanary,
      headers: [["authorization", `Bearer ${secretCanary}`]],
    };

    const results = await loggedResults(mailFailing([leaky as ConnectorCallRequest]));

    expect(results).toMatchObject([{ cause: { code: "service-refused", why: "not-accepted" } }]);
    const text = JSON.stringify(results);
    expect(text).not.toContain(secretCanary);
    expect(text).not.toContain(replyCanary);
  });
});
