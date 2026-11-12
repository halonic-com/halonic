import type { AgentMethod, Workflow } from "@halonicjs/format";
import type { ChatTurnRequest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { halonicTool } from "../agent/turn-test-kit.test-helper.ts";
import { KernelRuns, replyWorkflow, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { call, callAnswer, ScriptedConnector, textAnswer } from "../testing/scripted-model.ts";
import { replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";
import { methodConnectors } from "./method-tools.ts";

/** A made-up method of the writer: a careful draft with one tool and two steps. */
const draft: AgentMethod = {
  input: ["to"],
  instructions: "Draft a reply to {{to}}.",
  tools: ["lookup"],
  model: "careful",
  maxSteps: 2,
  output: "text",
};

/** The reply workflow, with its `draft` step calling the writer's `draft` method. */
const methodWorkflow: Workflow = {
  ...replyWorkflow,
  states: {
    ...replyWorkflow.states,
    draft: {
      type: "task",
      agent: "writer",
      method: "draft",
      with: { to: "{{input.from}}" },
      output: "reply",
      on: [{ to: "sent", event: "done" }],
    },
  },
};

const tools = [
  halonicTool("lookup", async () => "found"),
  halonicTool("publish", async () => "published"),
];

/** Runs the method workflow to its end on the given answers, noting the models asked for. */
async function runMethod(answers: Parameters<typeof runsOn>[0], method: AgentMethod = draft) {
  const asked: ChatTurnRequest[] = [];
  const runs = new KernelRuns();
  const setup = runsOn(answers, runs, {
    workflow: methodWorkflow,
    agents: { writer: { ...writerAgent(), methods: { draft: method } } },
    halonicTools: tools,
    onResolveModel: (request) => asked.push(request),
  });
  await setup.executor.start(replyStart);
  await setup.scheduler.runDue();
  return { ...setup, runs, asked };
}

function offered(request: { tools?: readonly { name: string }[] } | undefined): string[] {
  return (request?.tools ?? []).map((tool) => tool.name);
}

verifies("engine.task-method", () => {
  it("asks for the method's model alias and sends the method's prompt", async () => {
    const { asked, model, runs } = await runMethod([textAnswer("Dear support")]);
    expect(asked.map((request) => request.alias)).toEqual(["careful"]);
    expect(model.requests[0]?.messages.at(-1)).toEqual({
      role: "user",
      content: 'Method "draft".\n\nDraft a reply to support.',
    });
    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
  });

  it("offers only the tools the method names, and none for []", async () => {
    const named = await runMethod([textAnswer("Dear support")]);
    expect(offered(named.model.requests[0])).toEqual(["lookup"]);
    const none = await runMethod([textAnswer("Dear support")], { ...draft, tools: [] });
    expect(offered(none.model.requests[0])).toEqual([]);
    const all = await runMethod([textAnswer("Dear support")], {
      input: [],
      instructions: "Go.",
      output: "text",
    });
    expect(offered(all.model.requests[0])).toEqual(["lookup", "publish"]);
  });

  it("stops the call at the method's maxSteps, not the agent's", async () => {
    const lookup = (id: string) => callAnswer(call(id, "lookup"));
    const { model, runs } = await runMethod([lookup("l-1"), lookup("l-2"), lookup("l-3")]);
    expect(model.requests).toHaveLength(2);
    expect(await runs.get("run_1")).toMatchObject({ status: "failed" });
  });

  it("gives a connector only the tools the method names", async () => {
    const connector = new ScriptedConnector("crm", [
      { name: "lookup", description: "Look up", parameters: {} },
      { name: "update", description: "Update", parameters: {} },
    ]);
    const [narrowed] = methodConnectors([connector], draft);
    expect((await narrowed?.listTools())?.map((tool) => tool.name)).toEqual(["lookup"]);
    expect(methodConnectors([connector], { ...draft, tools: undefined })).toEqual([connector]);
  });
});
