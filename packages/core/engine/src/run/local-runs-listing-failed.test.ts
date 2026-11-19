import type { RunEvent } from "@halonicjs/events";
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

/** An error as the MCP adapter throws one for a program that isn't on this computer. */
function programMissing(program: string): Error {
  return Object.assign(new Error(`The program ${program} was not found.`), {
    name: "ProgramNotFoundError",
    program,
  });
}

/** A run of the reply workflow whose writer lists `handbook-files`, whose listing throws `error`. */
async function runWithBrokenListing(error: Error) {
  const handbook = new ScriptedConnector("handbook-files", error);
  const setup = runsOn([textAnswer("Found")], new KernelRuns(), {
    agents: agentsUsing(["handbook-files"], "writer"),
    connectors: [handbook],
    connectorTools: { "handbook-files": { approve: [], read: [] } },
    connectorCalls: sendingOn,
  });
  await setup.executor.start(replyStart);
  await setup.scheduler.runDue();
  const log = setup.runs.logs.get("run_1") ?? [];
  return { setup, log };
}

function listingFailures(log: readonly RunEvent[]): RunEvent[] {
  return log.filter((event) => event.type === "connector.listing-failed");
}

verifies("engine.connector-listing-failed", () => {
  it("logs a connector whose program is missing, by name, and the run goes on", async () => {
    const { setup, log } = await runWithBrokenListing(programMissing("npx-nope"));

    expect(listingFailures(log)).toMatchObject([
      {
        type: "connector.listing-failed",
        agent: "writer",
        connector: "handbook-files",
        cause: { code: "connector-not-started", why: "program-missing", name: "npx-nope" },
      },
    ]);
    expect(await setup.runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { reply: "Found" },
    });
  });

  it("logs another failure as other, and keeps the error's message out of the log", async () => {
    const secretValue = "invented-token-0000";
    const { log } = await runWithBrokenListing(new Error(`exited: bad key ${secretValue}`));

    const [failure] = listingFailures(log);
    expect(failure).toMatchObject({
      cause: { code: "connector-not-started", why: "other" },
    });
    expect(failure).not.toHaveProperty("cause.name");
    expect(JSON.stringify(failure)).not.toContain(secretValue);
  });
});
