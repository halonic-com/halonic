import type { RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { WorkspaceWorkflows } from "./workspace-workflows.ts";

const replyFile = "id: reply\nname: Reply\ninitial: first\nstates:\n  first:\n    type: final\n";

function setup(runs: Partial<RunSummary>[] = []) {
  const store: Record<string, string> = {
    "hubs/acme/hub.yaml": "id: acme\nname: Acme\n",
    "hubs/beta/hub.yaml": "id: beta\nname: Beta\n",
    "hubs/acme/workflows/reply.workflow.yaml": replyFile,
  };
  const changes: { label: string; changes: Record<string, string | null> }[] = [];
  const fileListeners = new Set<() => void>();
  const runListeners = new Set<() => void>();
  const host = new WorkspaceWorkflows({
    files: {
      read: async (path) => store[path] ?? null,
      list: async (dir) =>
        Object.keys(store)
          .filter((path) => path.startsWith(`${dir}/`))
          .sort(),
      change: (label, made) => {
        changes.push({ label, changes: made });
        for (const [path, text] of Object.entries(made)) {
          if (text === null) delete store[path];
          else store[path] = text;
        }
      },
    },
    onChange: (listener) => {
      fileListeners.add(listener);
      return () => fileListeners.delete(listener);
    },
    runs: {
      list: async () => runs.map((summary) => ({ summary: summary as RunSummary })),
      subscribe: (listener) => {
        runListeners.add(listener);
        return () => runListeners.delete(listener);
      },
    },
  });
  return { store, changes, fileListeners, runListeners, host };
}

const reply = { hubId: "acme", workflowId: "reply", kind: "run" } as const;

verifies("studio.workspace-workflows", () => {
  it("lists the hub workflows with their problems and their waiting and running runs", async () => {
    const { host } = setup([
      { ...reply, status: "waiting" },
      { ...reply, status: "running" },
      { ...reply, status: "completed" },
      { ...reply, status: "running", kind: "test" },
      { ...reply, hubId: "beta", status: "waiting" },
    ]);

    expect(await host.list()).toEqual([
      {
        hubId: "acme",
        id: "reply",
        name: "Reply",
        description: undefined,
        problems: { errors: 0, warnings: 0 },
        runs: { waiting: 1, running: 1 },
      },
    ]);
    expect(host.hubs()).toEqual([
      { id: "acme", name: "Acme" },
      { id: "beta", name: "Beta" },
    ]);
  });

  it("counts the errors and warnings the checks found in a workflow's file", async () => {
    const { host, store } = setup();
    store["hubs/acme/workflows/reply.workflow.yaml"] =
      "id: reply\nname: Reply\ninitial: first\nstates:\n  first:\n    on:\n      - to: nowhere\n";

    const [listing] = await host.list();

    expect(listing?.problems.errors).toBeGreaterThan(0);
  });

  it("creates start → done as one unsaved change, listed at once, with only the pass-through warning", async () => {
    const { host, changes } = setup();

    const ref = await host.create({ name: "Invoice intake", hubId: "acme" });

    expect(ref).toEqual({ hubId: "acme", id: "invoice-intake" });
    expect(changes.map((change) => Object.keys(change.changes))).toEqual([
      ["hubs/acme/workflows/invoice-intake.workflow.yaml"],
    ]);
    const created = (await host.list()).find((each) => each.id === "invoice-intake");
    expect(created).toMatchObject({ name: "Invoice intake", problems: { errors: 0, warnings: 1 } });
  });

  it("takes -2 when the hub has the id, and writes the name as typed", async () => {
    const { host, store } = setup();

    const ref = await host.create({ name: 'Reply: "fast"', hubId: "acme" });
    const again = await host.create({ name: "Reply", hubId: "acme" });

    expect(ref.id).toBe("reply-fast");
    expect(again.id).toBe("reply-2");
    expect((await host.list()).find((each) => each.id === "reply-fast")?.name).toBe(
      'Reply: "fast"',
    );
    expect(store["hubs/acme/workflows/reply-2.workflow.yaml"]).toContain("id: reply-2");
  });

  it("refuses a hub the workspace doesn't have, before and after the first list, and writes nothing", async () => {
    const { host, changes } = setup();

    await expect(host.create({ name: "Reply", hubId: "" })).rejects.toThrow(/no hub/);
    await expect(host.create({ name: "Reply", hubId: "gone" })).rejects.toThrow(/no hub/);
    await host.list();
    await expect(host.create({ name: "Reply", hubId: "gone" })).rejects.toThrow(/no hub/);
    expect(changes).toEqual([]);
  });

  it("refuses a hub that was removed after the last list", async () => {
    const { host, store, changes } = setup();
    await host.list();
    delete store["hubs/beta/hub.yaml"];

    await expect(host.create({ name: "Reply", hubId: "beta" })).rejects.toThrow(/no hub/);
    expect(changes).toEqual([]);
  });

  it("tells subscribers of file and run changes until they stop", () => {
    const { host, fileListeners, runListeners } = setup();
    let heard = 0;

    const stop = host.subscribe(() => heard++);
    for (const listener of [...fileListeners, ...runListeners]) listener();
    stop();

    expect(heard).toBe(2);
    expect(fileListeners.size + runListeners.size).toBe(0);
  });
});
