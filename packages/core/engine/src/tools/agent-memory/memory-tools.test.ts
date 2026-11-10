import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { secretsWith, steppingClock } from "../../agent/turn-test-kit.test-helper.ts";
import { LocalExecutor } from "../../local-executor.ts";
import { call, callAnswer, ScriptedModel, textAnswer } from "../../testing/scripted-model.ts";
import { AgentMemory } from "./agent-memory.ts";
import { memoryRecords } from "./memory-records.test-helper.ts";
import { memoryToolNames, memoryTools } from "./memory-tools.ts";

function toolsOf(agentId = "clerk") {
  const memory = new AgentMemory({ records: memoryRecords(), clock: steppingClock(), agentId });
  const tools = memoryTools(memory);
  const run = (name: string, args: Record<string, unknown> = {}) => {
    const tool = tools.find((each) => each.definition.name === name);
    if (tool === undefined) throw new Error(`no tool ${name}`);
    return tool.run(args);
  };
  return { tools, run };
}

function executorOn(model: ScriptedModel, records = memoryRecords()) {
  return new LocalExecutor({
    resolveModel: async () => ({ provider: model, model: "scripted-1" }),
    halonicTools: [],
    memory: records,
    connectors: [],
    secrets: secretsWith(),
    clock: steppingClock(),
  });
}

const request = { hubId: "acme", messages: [{ role: "user" as const, content: "Hi" }], tools: [] };

verifies("engine.agent-memory-tools", () => {
  it("lists, saves and forgets notes", async () => {
    const { tools, run } = toolsOf();

    expect(tools.map((tool) => tool.definition.name)).toEqual([...memoryToolNames]);
    expect(await run("memory_list")).toBe("You have no notes yet.");
    expect(await run("memory_save", { title: " Refunds ", text: "Ask for the order number" })).toBe(
      'Saved the note "Refunds".',
    );
    await run("memory_save", { title: "Billing", text: "Monthly" });
    expect(await run("memory_list")).toBe(
      "## Billing\n\nMonthly\n\n## Refunds\n\nAsk for the order number",
    );
    expect(await run("memory_forget", { title: "Refunds " })).toBe('Removed the note "Refunds".');
    expect(await run("memory_forget", { title: "Refunds" })).toBe(
      'There is no note titled "Refunds".',
    );
  });

  it("fails a call with a missing or non-string argument", async () => {
    const { run } = toolsOf();

    await expect(run("memory_save", { title: "Refunds" })).rejects.toThrow(
      "text must be a string.",
    );
    await expect(run("memory_forget", { title: 3 })).rejects.toThrow("title must be a string.");
  });

  it("lets a later chat turn of the agent find a note an earlier one saved", async () => {
    const records = memoryRecords();
    const saving = new ScriptedModel([
      callAnswer(call("c1", "memory_save", { title: "Refunds", text: "Ask for the order number" })),
      textAnswer("Noted"),
    ]);
    await executorOn(saving, records).chatTurn({ ...request, agentId: "clerk" });
    const listing = new ScriptedModel([callAnswer(call("c1", "memory_list")), textAnswer("Done")]);

    await executorOn(listing, records).chatTurn({ ...request, agentId: "clerk" });

    expect(saving.requests[0]?.tools?.map((tool) => tool.name)).toEqual([...memoryToolNames]);
    expect(records.log[0]?.collection).toBe("agent-memory/clerk");
    expect(listing.requests[1]?.messages.at(-1)).toMatchObject({
      role: "tool",
      content: "## Refunds\n\nAsk for the order number",
    });
  });

  it("offers no memory tools to a chat turn without an agent", async () => {
    const model = new ScriptedModel([textAnswer("Hello")]);

    await executorOn(model).chatTurn(request);

    expect(model.requests[0]?.tools ?? []).toEqual([]);
  });
});
