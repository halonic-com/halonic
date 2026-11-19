import type { SendingSettings } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import type { ConnectorTool } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns } from "../kernel/kernel-test-kit.test-helper.ts";
import { ScriptedConnector, textAnswer } from "../testing/scripted-model.ts";
import type { RunConnectorCalls } from "./connector-calls.ts";
import { agentsUsing, replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";

const readMail: ConnectorTool = {
  name: "read_mail",
  description: "Reads a mail",
  parameters: { type: "object" },
  risk: "read",
};

const sending: SendingSettings = { checkSending: async () => ({ allowed: true }) };
const connectorCalls: RunConnectorCalls = {
  location: "/workspaces/acme",
  sending,
  reportSettingsError: () => {},
};

/** A start error as a connector adapter throws it (`ports.connector-start-failure`). */
function startError(name: string, fields: Record<string, unknown>) {
  const message = "didn't start: the program printed acme-printed-text";
  return Object.assign(new Error(message), { name, ...fields });
}

/** Runs the writer's step once, on the connector `mail` listing `tools` or throwing them. */
async function stepWith(tools: ConnectorTool[] | Error) {
  const runs = new KernelRuns();
  const engine = runsOn([textAnswer("Nothing to read")], runs, {
    agents: agentsUsing(["mail"], "writer"),
    connectors: [new ScriptedConnector("mail", tools)],
    connectorCalls,
  });
  await engine.executor.start(replyStart);
  await engine.scheduler.runDue();
  return runs.logs.get("run_1") ?? [];
}

function typesOf(events: readonly RunEvent[]): string[] {
  return events
    .map((event) => event.type)
    .filter((type) => type === "connector.not-started" || type === "llm.request");
}

verifies("engine.turn-logs-connector-not-started", () => {
  it("names the program that's missing before the model is asked, though the model calls nothing", async () => {
    const events = await stepWith(startError("ProgramNotFoundError", { program: "acme-mail-mcp" }));

    expect(typesOf(events)).toEqual(["connector.not-started", "llm.request"]);
    expect(events.find((event) => event.type === "connector.not-started")).toMatchObject({
      agent: "writer",
      connector: "mail",
      cause: { code: "connector-not-started", why: "program-missing", name: "acme-mail-mcp" },
    });
    expect(JSON.stringify(events)).not.toContain("acme-printed-text");
  });

  it("names the secret that isn't set", async () => {
    const events = await stepWith(startError("SecretNotSetError", { secretName: "mailbox-token" }));

    expect(events.find((event) => event.type === "connector.not-started")).toMatchObject({
      cause: { code: "connector-not-started", why: "secret-not-set", name: "mailbox-token" },
    });
  });

  it("says other, with no name, when the error doesn't say why", async () => {
    const events = await stepWith(new Error("the server hung up"));

    expect(events.find((event) => event.type === "connector.not-started")).toHaveProperty("cause", {
      code: "connector-not-started",
      why: "other",
    });
  });

  it("logs none when the connector lists its tools", async () => {
    const events = await stepWith([readMail]);

    expect(typesOf(events)).toEqual(["llm.request"]);
  });
});
