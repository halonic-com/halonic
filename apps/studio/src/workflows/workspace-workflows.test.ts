import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { replyFile, setup } from "./workspace-workflows.test-helper.ts";

const reply = { hubId: "acme", workflowId: "reply", kind: "run" } as const;

verifies("studio.workspace-workflows", () => {
  it("lists the hub workflows with their problems and their waiting and running runs", async () => {
    const { host } = setup([
      { ...reply, status: "waiting", startedAt: "2026-11-10T09:00:00Z" },
      { ...reply, status: "running", startedAt: "2026-11-10T09:01:00Z" },
      { ...reply, status: "completed", startedAt: "2026-11-09T09:00:00Z" },
      { ...reply, status: "running", kind: "test", startedAt: "2026-11-11T09:00:00Z" },
      { ...reply, hubId: "beta", status: "waiting", startedAt: "2026-11-12T09:00:00Z" },
    ]);

    expect(await host.list()).toEqual([
      {
        hubId: "acme",
        id: "reply",
        name: "Reply",
        description: undefined,
        problems: { errors: 0, warnings: 0 },
        runs: { waiting: 1, running: 1 },
        lastRun: { startedAt: "2026-11-10T09:01:00Z", outcome: "running" },
      },
    ]);
    expect(host.hubs()).toEqual([
      { id: "acme", name: "Acme" },
      { id: "beta", name: "Beta" },
    ]);
  });

  it("gives the newest run of the workflow as its last run, whatever order the runs come in", async () => {
    const { host } = setup([
      { ...reply, status: "completed", startedAt: "2026-11-08T09:00:00Z" },
      { ...reply, status: "failed", startedAt: "2026-11-09T09:00:00Z" },
      { ...reply, status: "completed", startedAt: "2026-11-07T09:00:00Z" },
    ]);

    const [listing] = await host.list();

    expect(listing?.lastRun).toEqual({ startedAt: "2026-11-09T09:00:00Z", outcome: "failed" });
  });

  it("has no last run for a workflow that never ran, nor for one that only has tests", async () => {
    const { host } = setup([
      { ...reply, kind: "test", status: "completed", startedAt: "2026-11-09T09:00:00Z" },
    ]);

    const [listing] = await host.list();

    expect(listing?.lastRun).toBeUndefined();
  });

  it("counts the errors and warnings the checks found in a workflow's file", async () => {
    const { host, store } = setup();
    store["hubs/acme/workflows/reply.workflow.yaml"] =
      "id: reply\nname: Reply\ninitial: first\nstates:\n  first:\n    on:\n      - to: nowhere\n";

    const [listing] = await host.list();

    expect(listing?.problems.errors).toBeGreaterThan(0);
  });

  it("creates start → done as one unsaved change, listed at once, with only the error that start has no agent when the hub has none", async () => {
    const { host, changes } = setup();

    const ref = await host.create({ name: "Invoice intake", hubId: "acme" });

    expect(ref).toEqual({ hubId: "acme", id: "invoice-intake" });
    expect(changes.map((change) => Object.keys(change.changes))).toEqual([
      ["hubs/acme/workflows/invoice-intake.workflow.yaml"],
    ]);
    const created = (await host.list()).find((each) => each.id === "invoice-intake");
    expect(created).toMatchObject({ name: "Invoice intake", problems: { errors: 1, warnings: 0 } });
  });

  it("gives a new workflow's start the hub's first agent by id, so it has no problems", async () => {
    const { host, store } = setup();
    store["hubs/acme/agents/writer.agent.yaml"] = "id: writer\nname: Writer\n";
    store["hubs/acme/agents/reviewer.agent.yaml"] = "id: reviewer\nname: Reviewer\n";

    await host.create({ name: "Invoice intake", hubId: "acme" });

    expect(store["hubs/acme/workflows/invoice-intake.workflow.yaml"]).toContain(
      "  start:\n    agent: reviewer\n",
    );
    const created = (await host.list()).find((each) => each.id === "invoice-intake");
    expect(created?.problems).toEqual({ errors: 0, warnings: 0 });
  });

  it("leaves start without an agent in a folder with no hub, so the new Default hub's workflow has the one error", async () => {
    const { host, store } = setup();
    for (const path of Object.keys(store)) delete store[path];

    await host.create({ name: "Daily summary", hubId: "default" });

    expect(store["hubs/default/workflows/daily-summary.workflow.yaml"]).not.toContain("agent:");
    const [created] = await host.list();
    expect(created).toMatchObject({ id: "daily-summary", problems: { errors: 1, warnings: 0 } });
  });

  it("knows a workflow's name once it has read or made it, for the tab and the page title", async () => {
    const { host } = setup();
    expect(host.nameOf({ hubId: "acme", id: "invoice-intake" })).toBeUndefined();

    await host.create({ name: "Invoice intake", hubId: "acme" });
    expect(host.nameOf({ hubId: "acme", id: "invoice-intake" })).toBe("Invoice intake");

    const [first] = await host.list();
    if (first === undefined) throw new Error("no workflow listed");
    expect(host.nameOf(first)).toBe(first.name);
  });

  it("tells subscribers once when it learns a name, so a tab opened before the read follows it", async () => {
    const { host, store } = setup();
    let heard = 0;
    host.subscribe(() => heard++);
    await host.read({ hubId: "acme", id: "reply" });
    await host.read({ hubId: "acme", id: "reply" });
    await host.list();
    expect(heard).toBe(1);
    store["hubs/acme/workflows/reply.workflow.yaml"] = replyFile.replace("Reply", "Answer");
    await host.list();
    expect([heard, host.nameOf({ hubId: "acme", id: "reply" })]).toEqual([2, "Answer"]);
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
