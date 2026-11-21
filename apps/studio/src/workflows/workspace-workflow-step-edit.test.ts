import type { WorkflowStepChange } from "@halonicjs/studio-feature-workflows/api";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { setup } from "./workspace-workflows.test-helper.ts";

verifies("studio.workspace-workflow-step-edit", () => {
  const path = "hubs/acme/workflows/reply.workflow.yaml";
  const twoSteps = [
    "id: reply",
    "name: Reply",
    "initial: draft",
    "states:",
    "  draft:",
    "    # Writes the answer.",
    "    agent: writer",
    "    description: Draft an answer",
    "    input: Answer {{input.message}}",
    "    on:",
    "      - to: done",
    "  done:",
    "    type: final",
    "",
  ].join("\n");

  it("gives each step's description, prompt and output, and says when the prompt is data", async () => {
    const { host, store } = setup();
    store[path] = twoSteps.replace(
      "  done:",
      "  sort:\n    agent: sorter\n    output: category\n    input:\n      text: '{{input.message}}'\n  done:",
    );

    const { steps } = await host.read({ hubId: "acme", id: "reply" });

    expect(steps[0]).toMatchObject({
      id: "draft",
      description: "Draft an answer",
      prompt: "Answer {{input.message}}",
      promptIsData: false,
      output: undefined,
    });
    expect(steps[1]).toMatchObject({
      id: "sort",
      prompt: undefined,
      promptIsData: true,
      output: "category",
    });
  });

  it("sets the fields given as one change, keeping comments and the other keys", async () => {
    const { host, store, changes } = setup();
    store[path] = twoSteps;

    await host.changeStep({ hubId: "acme", id: "reply" }, "draft", {
      prompt: "Answer kindly",
      output: "answer",
    });

    expect(changes).toHaveLength(1);
    expect(store[path]).toContain("    # Writes the answer.\n    agent: writer\n");
    expect(store[path]).toContain("    input: Answer kindly\n");
    expect(store[path]).toContain("    output: answer\n");
    const { steps } = await host.read({ hubId: "acme", id: "reply" });
    expect(steps[0]).toMatchObject({ prompt: "Answer kindly", output: "answer" });
  });

  it("takes an emptied field out of the file, and writes nothing for an empty field it doesn't have", async () => {
    const { host, store, changes } = setup();
    store[path] = twoSteps;

    await host.changeStep({ hubId: "acme", id: "reply" }, "draft", { description: " " });
    await host.changeStep({ hubId: "acme", id: "reply" }, "draft", { output: "" });

    expect(changes).toHaveLength(1);
    expect(store[path]).not.toContain("description:");
  });

  it("gives the agents of the workflow's own hub, for the Agent picker", async () => {
    const { host, store } = setup();
    store[path] = twoSteps;
    store["hubs/acme/agents/writer.agent.yaml"] = "id: writer\nname: Reply writer\nmodel: fast\n";
    store["hubs/beta/agents/sorter.agent.yaml"] = "id: sorter\nname: Sorter\nmodel: fast\n";

    const { agents } = await host.read({ hubId: "acme", id: "reply" });

    expect(agents).toEqual([{ id: "writer", name: "Reply writer" }]);
  });

  it("changes the kind and keeps the old kind's keys, and sets or takes out the agent", async () => {
    const { host, store, changes } = setup();
    store[path] = twoSteps;
    const reply = { hubId: "acme", id: "reply" };

    await host.changeStep(reply, "draft", { type: "wait" });
    expect(store[path]).toContain("    agent: writer\n");
    expect((await host.read(reply)).steps[0]).toMatchObject({ type: "wait", agent: "writer" });

    await host.changeStep(reply, "draft", { type: "task", agent: "" });
    expect(store[path]).not.toContain("agent:");
    await host.changeStep(reply, "draft", { agent: "sorter" });

    expect(changes).toHaveLength(3);
    expect(store[path]).toContain("    # Writes the answer.\n");
    expect((await host.read(reply)).steps[0]).toMatchObject({ type: "task", agent: "sorter" });
  });

  it("writes a kind as the step's first key, and takes it out for an agent step", async () => {
    const { host, store } = setup();
    store[path] = twoSteps;
    const reply = { hubId: "acme", id: "reply" };

    await host.changeStep(reply, "draft", { type: "wait" });
    expect(store[path]).toContain("  draft:\n    type: wait\n    # Writes the answer.\n");

    await host.changeStep(reply, "draft", { type: "task" });
    expect(store[path]).toBe(twoSteps);
  });

  it("refuses a kind the format doesn't have, writing nothing", async () => {
    const { host, store, changes } = setup();
    store[path] = twoSteps;
    const change = { type: "loop" } as unknown as WorkflowStepChange;

    await expect(
      host.changeStep({ hubId: "acme", id: "reply" }, "draft", change),
    ).rejects.toMatchObject({ kind: "invalid_input" });
    expect(changes).toEqual([]);
  });

  it("refuses a step or a workflow that isn't there, and a prompt written as data, writing nothing", async () => {
    const { host, store, changes } = setup();
    store[path] = twoSteps.replace(
      "    input: Answer {{input.message}}",
      "    input:\n      text: hi",
    );
    const reply = { hubId: "acme", id: "reply" };

    await expect(host.changeStep(reply, "gone", { prompt: "Hi" })).rejects.toMatchObject({
      kind: "not_found",
    });
    await expect(host.changeStep(reply, "toString", { prompt: "Hi" })).rejects.toMatchObject({
      kind: "not_found",
    });
    await expect(
      host.changeStep({ hubId: "acme", id: "gone" }, "draft", { prompt: "Hi" }),
    ).rejects.toMatchObject({ kind: "not_found" });
    await expect(host.changeStep(reply, "draft", { prompt: "Hi" })).rejects.toMatchObject({
      kind: "invalid_input",
    });
    expect(changes).toEqual([]);
  });
});
