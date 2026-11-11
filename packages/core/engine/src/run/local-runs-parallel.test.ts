import type { Connector, Workflow } from "@halonicjs/format";
import type { ConnectorTool, ToolRisk } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns } from "../kernel/kernel-test-kit.test-helper.ts";
import { ScriptedConnector, textAnswer } from "../testing/scripted-model.ts";
import type { RunConnectorCalls } from "./connector-calls.ts";
import { agentsUsing, runsOn } from "./local-runs-test-kit.test-helper.ts";

/** Two branches whose results go to `findings`; a failed branch gives `{ error }`. */
const research: Workflow = {
  version: 1,
  id: "research",
  name: "Research a topic",
  initial: "research",
  context: {},
  states: {
    research: {
      type: "parallel",
      branches: {
        web: { agent: "searcher", input: "Search the web" },
        notes: { agent: "reader", input: "Read the notes" },
      },
      output: "findings",
      continueOnError: true,
      on: [{ to: "done", event: "done" }],
    },
    done: { type: "final", on: [] },
  },
  layout: {},
};

const researchStart = { hubId: "acme", workflowId: "research", input: {} };

/** A `mail` tool, listed with `risk` when one is given. */
function mailTool(name: string, risk?: ToolRisk): ConnectorTool {
  return {
    name,
    description: `Does ${name}`,
    parameters: { type: "object", properties: {} },
    ...(risk === undefined ? {} : { risk }),
  };
}

const sendingOn: RunConnectorCalls = {
  location: "/workspaces/acme",
  sending: { checkSending: async () => ({ allowed: true }) },
  reportSettingsError: () => {},
};

verifies("engine.parallel-state", () => {
  it("carries out every branch's call at once through the executor, then moves on", async () => {
    const { executor, model, runs, scheduler } = runsOn(
      [textAnswer("w"), textAnswer("n")],
      new KernelRuns(),
      { workflow: research },
    );
    await executor.start(researchStart);
    const timers = [...scheduler.timers.values()];
    expect(timers.map((timer) => timer.timerId)).toEqual(["call:call-1", "call:call-2"]);
    scheduler.timers.clear();

    await Promise.all(timers.map((timer) => executor.onTimer(timer)));

    expect(model.requests).toHaveLength(2);
    const summary = await runs.get("run_1");
    expect(summary).toMatchObject({ status: "completed", state: "done" });
    const findings = summary?.context["findings"] as Record<string, unknown>;
    expect(Object.keys(findings)).toEqual(["notes", "web"]);
    expect(new Set(Object.values(findings))).toEqual(new Set(["w", "n"]));
  });

  it("records a branch whose model call failed, and the run goes on", async () => {
    // Calls go in name order: notes (call-1) answers, then web (call-2) fails.
    const { executor, runs, scheduler } = runsOn(
      [textAnswer("n"), new Error("The model went away.")],
      new KernelRuns(),
      { workflow: research },
    );
    await executor.start(researchStart);

    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { web: { error: "The model went away." }, notes: "n" },
    });
    expect(runs.logs.get("run_1")).toContainEqual(
      expect.objectContaining({ type: "agent.finished", branch: "web", reason: "error" }),
    );
  });

  it("offers a branch's agent only the connector tools that read", async () => {
    const mail = new ScriptedConnector(
      "mail",
      [
        mailTool("search", "read"),
        mailTool("archive", "write"),
        mailTool("send_mail", "send"),
        mailTool("label"),
      ],
      () => "done",
    );
    const { executor, model, runs, scheduler } = runsOn(
      [textAnswer("n"), textAnswer("w")],
      new KernelRuns(),
      {
        workflow: research,
        agents: agentsUsing(["mail"], "searcher", "reader"),
        connectors: [mail],
        connectorCalls: sendingOn,
      },
    );
    await executor.start(researchStart);

    await scheduler.runDue();

    expect(model.requests).toHaveLength(2);
    for (const request of model.requests) {
      expect(request.tools?.map((tool) => tool.name)).toEqual(["search"]);
    }
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });
});

verifies("engine.parallel-connector-approve", () => {
  it("leaves out a read tool its connector's file puts under approve", async () => {
    const model = await branchesOfferedUnder(["search"]);

    for (const request of model.requests) {
      expect(request.tools?.map((tool) => tool.name)).toEqual(["list_folders"]);
    }
  });

  it("offers a branch no connector tools when the file says approve: all", async () => {
    const model = await branchesOfferedUnder("all");

    for (const request of model.requests) {
      expect(request.tools?.map((tool) => tool.name) ?? []).toEqual([]);
    }
  });
});

/** The model after both branches of a run asked, whose `mail` file has the `approve` list given. */
async function branchesOfferedUnder(approve: Connector["tools"]["approve"]) {
  const mail = new ScriptedConnector(
    "mail",
    [mailTool("search", "read"), mailTool("list_folders", "read")],
    () => "done",
  );
  const { executor, model, runs, scheduler } = runsOn(
    [textAnswer("n"), textAnswer("w")],
    new KernelRuns(),
    {
      workflow: research,
      agents: agentsUsing(["mail"], "searcher", "reader"),
      connectors: [mail],
      connectorTools: { mail: { approve } },
      connectorCalls: sendingOn,
    },
  );
  await executor.start(researchStart);
  await scheduler.runDue();

  expect(model.requests).toHaveLength(2);
  expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  return model;
}
