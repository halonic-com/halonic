import { maxCauseNameLength, type RunEvent } from "@halonicjs/events";
import type { ConnectorPartOff, ConnectorTool } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns } from "../kernel/kernel-test-kit.test-helper.ts";
import { ScriptedConnector, textAnswer } from "../testing/scripted-model.ts";
import type { RunConnectorCalls } from "./connector-calls.ts";
import { agentsUsing, replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";

const sendingOn: RunConnectorCalls = {
  location: "/workspaces/acme",
  sending: { checkSending: async () => ({ allowed: true }) },
  reportSettingsError: () => {},
};

const forecast: ConnectorTool = { name: "forecast", description: "The weather", parameters: {} };

/** A connector of several parts, as a plugin's is, that gives `off` at its first `newPartsOff`. */
class PartlyOffConnector extends ScriptedConnector {
  #off: readonly ConnectorPartOff[];

  constructor(id: string, tools: ConnectorTool[] | Error, off: readonly ConnectorPartOff[]) {
    super(id, tools);
    this.#off = off;
  }

  newPartsOff(): readonly ConnectorPartOff[] {
    const off = this.#off;
    this.#off = [];
    return off;
  }
}

/** A run of the reply workflow whose writer lists `connector`. */
async function runWith(connector: ScriptedConnector) {
  const setup = runsOn([textAnswer("Found")], new KernelRuns(), {
    agents: agentsUsing([connector.id], "writer"),
    connectors: [connector],
    connectorTools: { [connector.id]: { approve: [], read: [] } },
    connectorCalls: sendingOn,
  });
  await setup.executor.start(replyStart);
  await setup.scheduler.runDue();
  const log = setup.runs.logs.get("run_1") ?? [];
  return { setup, log };
}

function partsOff(log: readonly RunEvent[]): RunEvent[] {
  return log.filter((event) => event.type === "connector.part-off");
}

verifies("engine.connector-part-off", () => {
  it("logs a part that is off while the connector's other tools are offered, and the run goes on", async () => {
    const weather = new PartlyOffConnector(
      "weather",
      [forecast],
      [{ part: "local:lister", reason: "sandbox-unavailable" }],
    );
    const { setup, log } = await runWith(weather);

    expect(partsOff(log)).toMatchObject([
      {
        type: "connector.part-off",
        agent: "writer",
        connector: "weather",
        part: "local:lister",
        reason: "sandbox-unavailable",
      },
    ]);
    expect(log.some((event) => event.type === "connector.listing-failed")).toBe(false);
    expect(await setup.runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { reply: "Found" },
    });
  });

  it("logs the parts that are off also when no part lists, next to the listing's failure", async () => {
    const weather = new PartlyOffConnector("weather", new Error("no part started"), [
      { part: "backend", reason: "not-trusted" },
      { part: "local:lister", reason: "needs-desktop-app" },
    ]);
    const { log } = await runWith(weather);

    expect(partsOff(log)).toMatchObject([
      { part: "backend", reason: "not-trusted" },
      { part: "local:lister", reason: "needs-desktop-app" },
    ]);
    const connectorEvents = log
      .map((event) => event.type)
      .filter((type) => type.startsWith("connector."));
    expect(connectorEvents).toEqual([
      "connector.part-off",
      "connector.part-off",
      "connector.listing-failed",
    ]);
  });

  it("cuts a long part name", async () => {
    const long = `local:${"x".repeat(maxCauseNameLength * 2)}`;
    const weather = new PartlyOffConnector(
      "weather",
      [forecast],
      [{ part: long, reason: "failed" }],
    );
    const { log } = await runWith(weather);

    expect(partsOff(log)).toMatchObject([{ part: long.slice(0, maxCauseNameLength) }]);
  });

  it("logs nothing for a connector that has no parts to report", async () => {
    const { log } = await runWith(new ScriptedConnector("handbook-files", [forecast]));

    expect(partsOff(log)).toEqual([]);
  });
});
