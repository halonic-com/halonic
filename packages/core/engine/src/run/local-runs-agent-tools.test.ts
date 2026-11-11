import type { Agent, Workflow } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { halonicTool } from "../agent/turn-test-kit.test-helper.ts";
import { KernelRuns, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { call, callAnswer, textAnswer } from "../testing/scripted-model.ts";
import { memoryRecords } from "../tools/agent-memory/memory-records.test-helper.ts";
import { invoices } from "../tools/records/records-test-kit.test-helper.ts";
import { replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";

/** Runs the reply workflow to its end on the given answers and setup. */
async function runReply(...args: Parameters<typeof runsOn>) {
  const setup = runsOn(...args);
  await setup.executor.start(replyStart);
  await setup.scheduler.runDue();
  return setup;
}

/** The names of the tools the model was offered in its request at `index`. */
function offered(requests: { tools?: { name: string }[] }[], index: number) {
  return requests[index]?.tools?.map((tool) => tool.name);
}

/** An agent of the `acme` hub with the writer's defaults. */
function agent(id: string, fields: Partial<Agent> = {}): Agent {
  return { ...writerAgent(), id, name: id, ...fields };
}

const memoryToolNames = ["memory_list", "memory_save", "memory_forget"];

verifies("engine.run-agent-tools", () => {
  it("offers the run-log, records and subagent tools an agent's file grants, after its memory tools", async () => {
    const writer = agent("writer", {
      runLogs: true,
      collections: ["invoices"],
      subagents: ["checker"],
    });
    const { model } = await runReply([textAnswer("Dear support")], new KernelRuns(), {
      agents: { writer, checker: agent("checker") },
      collections: { invoices },
      memory: memoryRecords(),
    });

    expect(offered(model.requests, 0)).toEqual([
      ...memoryToolNames,
      "list_runs",
      "read_run",
      "find_invoices",
      "add_invoices",
      "update_invoices",
      "delegate_checker",
    ]);
  });

  it("offers none of them to an agent whose file leaves those fields at their defaults", async () => {
    const { model } = await runReply([textAnswer("Dear support")], new KernelRuns(), {
      agents: { writer: writerAgent(), checker: agent("checker") },
      collections: { invoices },
      memory: memoryRecords(),
    });

    expect(offered(model.requests, 0)).toEqual(memoryToolNames);
  });

  it("runs a subagent's own turn on the task and gives its answer to the delegating model", async () => {
    const { model, runs } = await runReply(
      [
        callAnswer(call("d-1", "delegate_checker", { task: "Check the reply to support" })),
        textAnswer("Looks right"),
        textAnswer("Dear support"),
      ],
      new KernelRuns(),
      {
        agents: { writer: agent("writer", { subagents: ["checker"] }), checker: agent("checker") },
      },
    );

    expect(model.requests[1]?.messages).toEqual([
      { role: "user", content: "Check the reply to support" },
    ]);
    expect(model.requests[1]?.meta).toEqual({ agentId: "checker" });
    expect(model.requests[2]?.messages.at(-1)).toMatchObject({
      role: "tool",
      toolCallId: "d-1",
      content: "Looks right",
    });
    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { reply: "Dear support" },
    });
  });

  it("stops delegating at depth 3 and gives the answers back up to the run", async () => {
    const delegate = (to: string, depth: number) =>
      callAnswer(call(`d-${depth}`, `delegate_${to}`, { task: `Task at depth ${depth + 1}` }));
    const { model, runs } = await runReply(
      [
        delegate("checker", 0),
        delegate("writer", 1),
        delegate("checker", 2),
        textAnswer("Checked at 3"),
        textAnswer("Written at 2"),
        textAnswer("Checked at 1"),
        textAnswer("Dear support"),
      ],
      new KernelRuns(),
      {
        agents: {
          writer: agent("writer", { subagents: ["checker"] }),
          checker: agent("checker", { subagents: ["writer"] }),
        },
      },
    );

    expect([0, 1, 2, 3].map((index) => offered(model.requests, index))).toEqual([
      ["delegate_checker"],
      ["delegate_writer"],
      ["delegate_checker"],
      [],
    ]);
    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { reply: "Dear support" },
    });
  });

  it("waits for a person's OK on a subagent's call that needs one, then makes it", async () => {
    const ran: string[] = [];
    const publish = {
      ...halonicTool("publish", async () => {
        ran.push("publish");
        return "published";
      }),
      risk: "write" as const,
    };
    const { executor, model, runs, scheduler } = await runReply(
      [
        callAnswer(call("d-1", "delegate_checker", { task: "Publish the reply" })),
        callAnswer(call("p-1", "publish")),
        textAnswer("Published it"),
        textAnswer("Dear support"),
      ],
      new KernelRuns(),
      {
        agents: { writer: agent("writer", { subagents: ["checker"] }), checker: agent("checker") },
        halonicTools: [publish],
      },
    );

    expect(ran).toEqual([]);
    expect(await runs.get("run_1")).toMatchObject({ status: "waiting" });

    await executor.send("run_1", "approve");
    await scheduler.runDue();

    expect(ran).toEqual(["publish"]);
    expect(model.requests[2]?.messages.at(-1)).toMatchObject({
      role: "tool",
      toolCallId: "p-1",
      content: expect.stringContaining("published"),
    });
    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { reply: "Dear support" },
    });
  });
});

verifies("engine.subagent-tools", () => {
  it("ends a parallel branch whose subagent's call needs an OK, and runs nothing", async () => {
    const ran: string[] = [];
    const publish = {
      ...halonicTool("publish", async () => {
        ran.push("publish");
        return "published";
      }),
      risk: "write" as const,
    };
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
          continueOnError: true,
          on: [{ to: "done", event: "done" }],
        },
        done: { type: "final", on: [] },
      },
      layout: {},
    };
    const { executor, runs, scheduler } = runsOn(
      [
        callAnswer(call("d-1", "delegate_checker", { task: "Publish the reply" })),
        callAnswer(call("p-1", "publish")),
      ],
      new KernelRuns(),
      {
        workflow: triage,
        agents: { writer: agent("writer", { subagents: ["checker"] }), checker: agent("checker") },
        halonicTools: [publish],
      },
    );
    await executor.start({ ...replyStart, workflowId: "triage" });
    await scheduler.runDue();

    expect(ran).toEqual([]);
    const log = runs.logs.get("run_1") ?? [];
    expect(log.map((event) => event.type)).not.toContain("approval.requested");
    expect(log).toContainEqual(
      expect.objectContaining({
        type: "agent.finished",
        agent: "writer",
        branch: "mail",
        output: null,
        error: expect.stringContaining(`stopped for an OK on tool "publish"`),
      }),
    );
    expect(await runs.get("run_1")).toMatchObject({
      status: "completed",
      context: { mail: { error: expect.any(String) } },
    });
  });
});
