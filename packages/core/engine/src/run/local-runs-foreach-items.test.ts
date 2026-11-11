import type { Workflow } from "@halonicjs/format";
import type { ConnectorTool, ToolRisk } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns, replyWorkflow } from "../kernel/kernel-test-kit.test-helper.ts";
import { ScriptedConnector, textAnswer } from "../testing/scripted-model.ts";
import { parentEndedError } from "./child-runs.ts";
import type { RunConnectorCalls } from "./connector-calls.ts";
import { cancelledError } from "./local-runs.ts";
import { agentsUsing, runsOn } from "./local-runs-test-kit.test-helper.ts";

/** Runs `step` for each customer, two at a time. */
function foreachOf(step: { agent: string } | { workflow: string }): Workflow {
  return {
    version: 1,
    id: "greet",
    name: "Greet the customers",
    initial: "greet",
    context: {},
    states: {
      greet: {
        type: "foreach",
        ...step,
        items: "{{input.customers}}",
        as: "from",
        concurrency: 2,
        output: "replies",
        on: [{ to: "done", event: "done" }],
      },
      done: { type: "final", on: [] },
    },
    layout: {},
  };
}

const greetStart = { hubId: "acme", workflowId: "greet", input: { customers: ["Acme", "Globex"] } };

/** A `mail` tool listed with `risk`. */
function mailTool(name: string, risk: ToolRisk): ConnectorTool {
  return {
    name,
    description: `Does ${name}`,
    parameters: { type: "object", properties: {} },
    risk,
  };
}

const sendingOn: RunConnectorCalls = {
  location: "/workspaces/acme",
  sending: { checkSending: async () => ({ allowed: true }) },
  reportSettingsError: () => {},
};

/** A run of `greet` whose items each run the reply workflow, with both children started. */
async function greetingChildren(answers: (ReturnType<typeof textAnswer> | Error)[]) {
  const engine = runsOn(answers, new KernelRuns(), {
    workflow: foreachOf({ workflow: "reply" }),
    workflows: { reply: replyWorkflow },
  });
  await engine.executor.start(greetStart);
  const children = [...engine.runs.logs.keys()].filter((runId) => runId !== "run_1");
  expect(children).toHaveLength(2);
  return { ...engine, children };
}

verifies("engine.foreach-connector-tools", () => {
  it("offers an item's agent only the tools a parallel branch gets", async () => {
    const mail = new ScriptedConnector(
      "mail",
      [mailTool("search", "read"), mailTool("send_mail", "send")],
      () => "done",
    );
    const { executor, model, runs, scheduler } = runsOn(
      [textAnswer("Hi Acme"), textAnswer("Hi Globex")],
      new KernelRuns(),
      {
        workflow: foreachOf({ agent: "writer" }),
        agents: agentsUsing(["mail"], "writer"),
        connectors: [mail],
        connectorCalls: sendingOn,
      },
    );
    await executor.start(greetStart);

    await scheduler.runDue();

    expect(model.requests).toHaveLength(2);
    for (const request of model.requests) {
      expect(request.tools?.map((tool) => tool.name) ?? []).toEqual([]);
    }
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });

  it("offers the agents of an item's child run only the tools a parallel branch gets", async () => {
    const mail = new ScriptedConnector(
      "mail",
      [mailTool("search", "read"), mailTool("send_mail", "send")],
      () => "done",
    );
    const { executor, model, runs, scheduler } = runsOn(
      [textAnswer("Hi Acme"), textAnswer("Hi Globex")],
      new KernelRuns(),
      {
        workflow: foreachOf({ workflow: "reply" }),
        workflows: { reply: replyWorkflow },
        agents: agentsUsing(["mail"], "writer"),
        connectors: [mail],
        connectorCalls: sendingOn,
      },
    );
    await executor.start(greetStart);

    await scheduler.runDue();

    expect(model.requests).toHaveLength(2);
    for (const request of model.requests) {
      expect(request.tools?.map((tool) => tool.name) ?? []).toEqual([]);
    }
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });
});

verifies("engine.child-runs-end-with-run", () => {
  it("ends every item's child run when the run is cancelled", async () => {
    const { executor, runs, children } = await greetingChildren([]);

    await executor.cancel("run_1");

    for (const child of children) {
      expect(await runs.get(child)).toMatchObject({
        status: "failed",
        reason: "cancelled",
        error: cancelledError,
      });
    }
  });

  it("ends the other items' child runs when one fails and fails the run", async () => {
    const { model, runs, scheduler, children } = await greetingChildren([
      new Error("the model is gone"),
      textAnswer("Hi Globex"),
    ]);

    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({ status: "failed" });
    expect(model.requests).toHaveLength(1);
    expect(await runs.get(children[1] ?? "")).toMatchObject({
      status: "failed",
      reason: "cancelled",
      error: parentEndedError,
    });
  });
});
