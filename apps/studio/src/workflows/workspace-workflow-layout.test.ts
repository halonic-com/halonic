import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { WorkspaceWorkflows } from "./workspace-workflows.ts";

const path = "hubs/acme/workflows/reply.workflow.yaml";
const reply = { hubId: "acme", id: "reply" };

/** Acme's `reply`, `start → done`, in files in memory; `more` is added to its text. */
function setup(more = "") {
  const store: Record<string, string> = {
    "hubs/acme/hub.yaml": "id: acme\nname: Acme\n",
    [path]: `id: reply\nname: Reply\ninitial: start\nstates:\n  # The first step.\n  start:\n    on:\n      - to: done\n  done:\n    type: final\n${more}`,
  };
  const changes: string[] = [];
  const host = new WorkspaceWorkflows({
    files: {
      read: async (file) => store[file] ?? null,
      list: async (dir) => Object.keys(store).filter((file) => file.startsWith(`${dir}/`)),
      change: (label, made) => {
        changes.push(label);
        for (const [file, text] of Object.entries(made)) if (text !== null) store[file] = text;
      },
    },
    onChange: () => () => {},
    runs: { list: async () => [], subscribe: () => () => {}, log: async () => [] },
  });
  return { host, store, changes };
}

verifies("studio.workspace-workflow-layout", () => {
  it("adds an agent step `step-1` at its place, as one change that keeps the comments", async () => {
    const { host, store, changes } = setup();

    expect(await host.addStep(reply, "task", { x: 240, y: 0 })).toBe("step-1");

    expect(changes).toHaveLength(1);
    expect(store[path]).toContain("  # The first step.\n  start:");
    const view = await host.read(reply);
    expect(view.steps.map((step) => [step.id, step.type])).toEqual([
      ["start", "task"],
      ["done", "final"],
      ["step-1", "task"],
    ]);
    expect(view.layout["step-1"]).toEqual({ x: 240, y: 0 });
  });

  it("numbers wait steps from `wait-1`, the next free number each time", async () => {
    const { host } = setup("layout:\n  done: { x: 0, y: 140 }\n");

    expect(await host.addStep(reply, "wait", { x: 0, y: 0 })).toBe("wait-1");
    expect(await host.addStep(reply, "wait", { x: 20, y: 0 })).toBe("wait-2");

    const view = await host.read(reply);
    expect(view.steps.filter((step) => step.type === "wait").map((step) => step.id)).toEqual([
      "wait-1",
      "wait-2",
    ]);
    expect(view.layout).toEqual({
      done: { x: 0, y: 140 },
      "wait-1": { x: 0, y: 0 },
      "wait-2": { x: 20, y: 0 },
    });
  });

  it("forgets the places for Auto layout, as one change, and writes nothing when there are none", async () => {
    const { host, store, changes } = setup("layout:\n  done: { x: 0, y: 140 }\n");

    await host.resetLayout(reply);
    await host.resetLayout(reply);

    expect(changes).toHaveLength(1);
    expect(store[path]).not.toContain("layout");
    expect((await host.read(reply)).layout).toEqual({});
  });

  it("refuses a workflow the hub doesn't have", async () => {
    const { host, changes } = setup();
    const gone = { hubId: "acme", id: "gone" };

    await expect(host.addStep(gone, "task", { x: 0, y: 0 })).rejects.toMatchObject({
      kind: "not_found",
    });
    await expect(host.resetLayout(gone)).rejects.toMatchObject({ kind: "not_found" });
    expect(changes).toEqual([]);
  });
});
