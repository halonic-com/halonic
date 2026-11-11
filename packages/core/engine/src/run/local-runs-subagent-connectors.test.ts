import type { Agent } from "@halonicjs/format";
import type { ConnectorTool, ToolRisk } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { KernelRuns, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { call, callAnswer, ScriptedConnector, textAnswer } from "../testing/scripted-model.ts";
import type { RunConnectorCalls } from "./connector-calls.ts";
import { replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";

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

/**
 * The reply workflow run to its end on `answers`, with a `mail` connector
 * whose file puts `list_folders` under `approve`, and with connector calls
 * unless `withConnectorCalls` is false.
 */
async function runReply(answers: Parameters<typeof runsOn>[0], withConnectorCalls = true) {
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
  const setup = runsOn(answers, new KernelRuns(), {
    agents,
    connectors: [mail],
    connectorTools: { mail: { approve: ["list_folders"] } },
    ...(withConnectorCalls ? { connectorCalls: sendingOn } : {}),
  });
  await setup.executor.start(replyStart);
  await setup.scheduler.runDue();
  return { ...setup, mail };
}

/** The names of the tools the model was offered in its request at `index`. */
function offered(requests: { tools?: { name: string }[] }[], index: number) {
  return requests[index]?.tools?.map((tool) => tool.name) ?? [];
}

verifies("engine.subagent-connector-reads", () => {
  it("offers a subagent its own connectors' tools that read and wait for no one", async () => {
    const { model, runs } = await runReply([
      delegate,
      textAnswer("Nothing to check"),
      textAnswer("Dear support"),
    ]);

    expect(offered(model.requests, 0)).toEqual(["delegate_checker"]);
    expect(offered(model.requests, 1)).toEqual(["search"]);
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
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
      false,
    );

    expect(offered(model.requests, 1)).toEqual([]);
  });
});
