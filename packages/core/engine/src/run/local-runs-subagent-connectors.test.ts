import type { RunEvent } from "@halonicjs/events";
import type { Agent, Workflow } from "@halonicjs/format";
import type { ChatRequest, ConnectorTool, ToolRisk } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { call, callAnswer, ScriptedConnector, textAnswer } from "../testing/scripted-model.ts";
import type { RunConnectorCalls } from "./connector-calls.ts";
import { replyStart, runsOn, typesOf } from "./local-runs-test-kit.test-helper.ts";

/** A tool of the `mail` connector, listed with `risk` when it's given. */
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

/** A `writer` that delegates to a `checker` whose file lists `mail`. */
const agents: Record<string, Agent> = {
  writer: { ...writerAgent(), subagents: ["checker"] },
  checker: { ...writerAgent(), id: "checker", name: "checker", connectors: ["mail"] },
};

const delegate = callAnswer(call("d-1", "delegate_checker", { task: "Find the support mail" }));

/** What a run of {@link runReply} differs in. */
interface ReplySetup {
  /** Whether the executor has connector calls; it has when left out. */
  readonly connectorCalls?: boolean;
  /** The hub's agents; {@link agents} when left out. */
  readonly agents?: Record<string, Agent>;
  /** The one workflow the hub has; the reply workflow when left out. */
  readonly workflow?: Workflow;
}

/**
 * The reply workflow run as far as it goes on `answers`, with a `mail`
 * connector whose file puts `list_folders` under `approve`.
 */
async function runReply(answers: Parameters<typeof runsOn>[0], setup: ReplySetup = {}) {
  const mail = new ScriptedConnector(
    "mail",
    [
      mailTool("search", "read"),
      mailTool("list_folders", "read"),
      mailTool("archive", "write"),
      mailTool("send_mail", "send"),
      mailTool("label"),
    ],
    () => "1 mail from support",
  );
  const run = runsOn(answers, new KernelRuns(), {
    agents: setup.agents ?? agents,
    connectors: [mail],
    connectorTools: { mail: { approve: ["list_folders"] } },
    ...(setup.connectorCalls === false ? {} : { connectorCalls: sendingOn }),
    ...(setup.workflow === undefined ? {} : { workflow: setup.workflow }),
  });
  const start = setup.workflow === undefined ? replyStart : { ...replyStart, workflowId: "triage" };
  await run.executor.start(start);
  await run.scheduler.runDue();
  return { ...run, mail };
}

/** The events of `type` in the run's log. */
function eventsOf(runs: KernelRuns, type: string): RunEvent[] {
  return (runs.logs.get("run_1") ?? []).filter((event) => event.type === type);
}

/** The tool message for the call `id` in the model's request at `index`. */
function resultIn(requests: readonly ChatRequest[], index: number, id: string) {
  return requests[index]?.messages.find(
    (message) => message.role === "tool" && message.toolCallId === id,
  );
}

/** A workflow whose one `parallel` branch is the `writer`'s. */
const triage: Workflow = {
  version: 1,
  id: "triage",
  name: "Triage the mail",
  initial: "triage",
  context: {},
  states: {
    triage: {
      type: "parallel",
      branches: { mail: { agent: "writer", input: "Triage the mail" } },
      output: "findings",
      on: [{ to: "done", event: "done" }],
    },
    done: { type: "final", on: [] },
  },
  layout: {},
};

/** The names of the tools the model was offered in its request at `index`. */
function offered(requests: { tools?: { name: string }[] }[], index: number) {
  return requests[index]?.tools?.map((tool) => tool.name) ?? [];
}

verifies("engine.subagent-connector-reads", () => {
  it("offers a subagent its own connectors' tools as the state's agent gets them", async () => {
    const { model, runs } = await runReply([
      delegate,
      textAnswer("Nothing to check"),
      textAnswer("Dear support"),
    ]);

    expect(offered(model.requests, 0)).toEqual(["delegate_checker"]);
    expect(offered(model.requests, 1)).toEqual([
      "search",
      "list_folders",
      "archive",
      "send_mail",
      "label",
    ]);
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });

  it("offers a subagent under a parallel branch only the tools that read and wait for no one", async () => {
    const { model } = await runReply([delegate, textAnswer("Nothing to check"), textAnswer("ok")], {
      workflow: triage,
    });

    expect(offered(model.requests, 0)).toEqual(["delegate_checker"]);
    expect(offered(model.requests, 1)).toEqual(["search"]);
  });

  it("records a subagent's call its parent may not make, after the OK, and makes it once", async () => {
    const { executor, scheduler, mail, model, runs } = await runReply([
      delegate,
      callAnswer(call("s-1", "archive", {})),
      textAnswer("Archived it"),
      textAnswer("Dear support"),
    ]);
    expect(eventsOf(runs, "approval.requested")).toMatchObject([
      { agent: "writer", subagent: "checker", tool: "archive" },
    ]);

    await executor.send("run_1", "approve");
    await scheduler.runDue();

    expect(eventsOf(runs, "effect.requested")).toMatchObject([
      { agent: "writer", subagent: "checker", connector: "mail", tool: "archive" },
    ]);
    expect(mail.calls).toEqual([{ name: "archive", args: {} }]);
    expect(resultIn(model.requests, 2, "s-1")).toMatchObject({
      content: expect.stringContaining("1 mail from support"),
    });
    expect(resultIn(model.requests, 3, "d-1")).toMatchObject({ content: "Archived it" });
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });

  it("waits for a person's OK on a subagent's call under approve, then makes it", async () => {
    const { executor, scheduler, mail, runs } = await runReply([
      delegate,
      callAnswer(call("s-1", "list_folders", {})),
      textAnswer("Listed them"),
      textAnswer("Dear support"),
    ]);

    expect(eventsOf(runs, "approval.requested")).toMatchObject([
      { agent: "writer", subagent: "checker", tool: "list_folders" },
    ]);
    expect(mail.calls).toEqual([]);

    await executor.send("run_1", "approve");
    await scheduler.runDue();

    expect(mail.calls).toEqual([{ name: "list_folders", args: {} }]);
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });

  it("refuses a subagent a tool its parent may use but its own file doesn't list", async () => {
    const { mail, model, runs } = await runReply(
      [delegate, callAnswer(call("s-1", "archive", {})), textAnswer("Can't"), textAnswer("ok")],
      {
        agents: {
          writer: { ...agents["writer"], connectors: ["mail"] } as Agent,
          checker: { ...agents["checker"], connectors: [] } as Agent,
        },
      },
    );

    expect(offered(model.requests, 0)).toContain("archive");
    expect(offered(model.requests, 1)).toEqual([]);
    expect(resultIn(model.requests, 2, "s-1")).toMatchObject({
      content: expect.stringContaining("Refused"),
    });
    expect(mail.calls).toEqual([]);
    expect(typesOf(runs.logs.get("run_1"))).not.toContain("effect.requested");
  });

  it("makes a subagent's read call and gives its result to the subagent's model", async () => {
    const { mail, model, runs } = await runReply([
      delegate,
      callAnswer(call("s-1", "search", {})),
      textAnswer("Found it"),
      textAnswer("Dear support"),
    ]);

    expect(mail.calls).toEqual([{ name: "search", args: {} }]);
    expect(model.requests[2]?.messages.at(-1)).toMatchObject({
      role: "tool",
      toolCallId: "s-1",
      content: expect.stringContaining("1 mail from support"),
    });
    expect(model.requests[3]?.messages.at(-1)).toMatchObject({
      role: "tool",
      toolCallId: "d-1",
      content: "Found it",
    });
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });

  it("offers a subagent no connector tools when the executor has no connector calls", async () => {
    const { model } = await runReply(
      [delegate, textAnswer("Nothing to check"), textAnswer("Dear support")],
      { connectorCalls: false },
    );

    expect(offered(model.requests, 1)).toEqual([]);
  });
});
