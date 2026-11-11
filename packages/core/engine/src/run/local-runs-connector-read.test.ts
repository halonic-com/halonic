import type { RunEvent } from "@halonicjs/events";
import type { Connector, Workflow } from "@halonicjs/format";
import type { ConnectorClient, ConnectorTool, ToolRisk } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns } from "../kernel/kernel-test-kit.test-helper.ts";
import { call, callAnswer, ScriptedConnector, textAnswer } from "../testing/scripted-model.ts";
import type { RunConnectorCalls } from "./connector-calls.ts";
import { agentsUsing, replyStart, runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";

/** A `tracker` tool, listed with `risk` when one is given. */
function trackerTool(name: string, risk?: ToolRisk): ConnectorTool {
  return {
    name,
    description: `Does ${name}`,
    parameters: { type: "object", properties: { query: { type: "string" } } },
    ...(risk === undefined ? {} : { risk }),
  };
}

const sendingOn: RunConnectorCalls = {
  location: "/workspaces/acme",
  sending: { checkSending: async () => ({ allowed: true }) },
  reportSettingsError: () => {},
};

function eventsOf(events: readonly RunEvent[] | undefined, type: RunEvent["type"]): RunEvent[] {
  return (events ?? []).filter((event) => event.type === type);
}

/**
 * A run of the reply workflow whose writer lists `connectors` and calls
 * `tool` on them once, then answers `Found`, with the connector files'
 * `tools` lists given.
 */
async function calling(
  tool: string,
  connectors: readonly ConnectorClient[],
  connectorTools: Readonly<Record<string, Connector["tools"]>>,
) {
  const answers = [callAnswer(call("c-1", tool, { query: "open" })), textAnswer("Found")];
  const setup = runsOn(answers, new KernelRuns(), {
    agents: agentsUsing(
      connectors.map((connector) => connector.id),
      "writer",
    ),
    connectors,
    connectorTools,
    connectorCalls: sendingOn,
  });
  await setup.executor.start(replyStart);
  await setup.scheduler.runDue();
  return setup;
}

verifies("engine.run-connector-read", () => {
  it("runs a tool the file's read list names without asking, and logs why", async () => {
    const tracker = new ScriptedConnector(
      "tracker",
      [trackerTool("search_issues")],
      () => "2 issues",
    );
    const { runs } = await calling("search_issues", [tracker], {
      tracker: { approve: [], read: ["search_issues"] },
    });

    expect(tracker.calls).toEqual([{ name: "search_issues", args: { query: "open" } }]);
    const log = runs.logs.get("run_1");
    expect(typesOf(log)).not.toContain("approval.requested");
    expect(eventsOf(log, "effect.requested")).toEqual([]);
    expect(eventsOf(log, "tool.unasked")).toMatchObject([
      {
        type: "tool.unasked",
        agent: "writer",
        connector: "tracker",
        tool: "search_issues",
        reason: "read-list",
      },
    ]);
    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { reply: "Found" },
    });
  });

  it("doesn't let a server's listing put its own tool on the read list", async () => {
    // Everything a listing could say to look harmless: `read`, an MCP
    // read-only hint, and a `read` list of its own.
    const selfListed = {
      ...trackerTool("create_issue", "read"),
      annotations: { readOnlyHint: true },
      read: ["create_issue"],
      tools: { read: ["create_issue"] },
    } as ConnectorTool;
    const tracker = new ScriptedConnector("tracker", [selfListed], () => "Created");
    const { runs } = await calling("create_issue", [tracker], {
      tracker: { approve: [], read: ["search_issues"] },
    });

    expect(tracker.calls).toEqual([]);
    const log = runs.logs.get("run_1");
    expect(typesOf(log)).toContain("approval.requested");
    expect(eventsOf(log, "tool.unasked")).toEqual([]);
    expect(await runs.get("run_1")).toMatchObject({ status: "waiting" });
  });

  it("reads only the list of the tool's own connector", async () => {
    const mail = new ScriptedConnector("mail", [], () => "none");
    const tracker = new ScriptedConnector("tracker", [trackerTool("search_issues")], () => "2");
    const { runs } = await calling("search_issues", [mail, tracker], {
      mail: { approve: [], read: ["search_issues"] },
      tracker: { approve: [] },
    });

    expect(tracker.calls).toEqual([]);
    expect(await runs.get("run_1")).toMatchObject({ status: "waiting" });
  });

  it("needs the exact name: a different case doesn't count", async () => {
    const tracker = new ScriptedConnector("tracker", [trackerTool("Search_issues")], () => "2");
    const { runs } = await calling("Search_issues", [tracker], {
      tracker: { approve: [], read: ["search_issues"] },
    });

    expect(tracker.calls).toEqual([]);
    expect(await runs.get("run_1")).toMatchObject({ status: "waiting" });
  });

  it("still asks when the file's approve list names the tool too, or says all", async () => {
    const approves: Connector["tools"]["approve"][] = [["search_issues"], "all"];
    for (const approve of approves) {
      const tracker = new ScriptedConnector("tracker", [trackerTool("search_issues")], () => "2");
      const { runs } = await calling("search_issues", [tracker], {
        tracker: { approve, read: ["search_issues"] },
      });

      expect(tracker.calls).toEqual([]);
      expect(eventsOf(runs.logs.get("run_1"), "tool.unasked")).toEqual([]);
      expect(await runs.get("run_1")).toMatchObject({ status: "waiting" });
    }
  });

  it("keeps a tool its server lists as send a send tool", async () => {
    const tracker = new ScriptedConnector(
      "tracker",
      [trackerTool("post_comment", "send")],
      () => "Posted",
    );
    const { executor, scheduler, runs } = await calling("post_comment", [tracker], {
      tracker: { approve: [], read: ["post_comment"] },
    });

    expect(tracker.calls).toEqual([]);
    expect(await runs.get("run_1")).toMatchObject({ status: "waiting" });

    await executor.send("run_1", "approve");
    await scheduler.runDue();

    expect(tracker.calls).toHaveLength(1);
    expect(eventsOf(runs.logs.get("run_1"), "effect.requested")).toHaveLength(1);
  });

  it("offers a parallel branch the tools the file's read list names, and no other", async () => {
    const tracker = new ScriptedConnector(
      "tracker",
      [trackerTool("search_issues"), trackerTool("list_labels", "read"), trackerTool("close")],
      () => "done",
    );
    const { executor, model, runs, scheduler } = runsOn(
      [textAnswer("a"), textAnswer("b")],
      new KernelRuns(),
      {
        workflow: twoBranches,
        agents: agentsUsing(["tracker"], "searcher", "reader"),
        connectors: [tracker],
        connectorTools: { tracker: { approve: [], read: ["search_issues"] } },
        connectorCalls: sendingOn,
      },
    );
    await executor.start({ hubId: "acme", workflowId: "triage", input: {} });
    await scheduler.runDue();

    expect(model.requests).toHaveLength(2);
    for (const request of model.requests) {
      expect(request.tools?.map((tool) => tool.name)).toEqual(["search_issues"]);
    }
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });
});

/** Two branches whose agents both list `tracker`. */
const twoBranches: Workflow = {
  version: 1,
  id: "triage",
  name: "Triage",
  initial: "look",
  context: {},
  states: {
    look: {
      type: "parallel",
      branches: {
        issues: { agent: "searcher", input: "Find open issues" },
        labels: { agent: "reader", input: "Read the labels" },
      },
      output: "findings",
      on: [{ to: "done", event: "done" }],
    },
    done: { type: "final", on: [] },
  },
  layout: {},
};
