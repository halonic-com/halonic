import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { setup } from "./workspace-workflows.test-helper.ts";

verifies("studio.workspace-workflow-read", () => {
  it("offers no startRun while the page has no engine", () => {
    expect(setup().host.startRun).toBeUndefined();
  });

  it("starts a run through the engine and returns the run's id", async () => {
    const started: unknown[] = [];
    const { host } = setup(
      [],
      {},
      {
        runsHarnesses: false,
        startRun: async (run, input) => {
          started.push({ run, input });
          return { id: "run_1" };
        },
      },
    );

    const result = await host.startRun?.({ hubId: "acme", id: "reply" }, { ticket: 42 });

    expect(result).toEqual({ runId: "run_1" });
    expect(started).toEqual([
      { run: { hubId: "acme", workflowId: "reply" }, input: { ticket: 42 } },
    ]);
  });

  it("waits for a pending save, then starts the run (R1)", async () => {
    const order: string[] = [];
    let saved!: () => void;
    const { host } = setup(
      [],
      {},
      {
        runsHarnesses: false,
        startRun: async () => {
          order.push("started");
          return { id: "run-1" };
        },
      },
      () =>
        new Promise<void>((resolve) => {
          saved = () => {
            order.push("saved");
            resolve();
          };
        }),
    );
    const started = host.startRun?.({ hubId: "acme", id: "reply" }, {});
    await Promise.resolve();
    expect(order).toEqual([]);
    saved();
    await expect(started).resolves.toEqual({ runId: "run-1" });
    expect(order).toEqual(["saved", "started"]);
  });

  it("doesn't start the run when the save fails, and says the workspace wasn't saved (R1)", async () => {
    let started = false;
    const { host } = setup(
      [],
      {},
      {
        runsHarnesses: false,
        startRun: async () => {
          started = true;
          return { id: "run-1" };
        },
      },
      async () => {
        throw new Error("EACCES: /secret/path");
      },
    );
    await host.list();
    await expect(host.startRun?.({ hubId: "acme", id: "reply" }, {})).rejects.toThrow(
      "The workspace couldn't be saved.",
    );
    expect(started).toBe(false);
  });

  it("starts a brand-new workflow only once its file is on disk (R3)", async () => {
    const onDisk = new Set<string>();
    let seen: boolean | undefined;
    const made = setup(
      [],
      {},
      {
        runsHarnesses: false,
        startRun: async () => {
          seen = onDisk.has("hubs/acme/workflows/new-one.workflow.yaml");
          return { id: "run-2" };
        },
      },
      async () => {
        for (const path of Object.keys(made.store)) onDisk.add(path);
      },
    );
    const ref = await made.host.create({ name: "New one", hubId: "acme" });
    await made.host.startRun?.(ref, {});
    expect(seen).toBe(true);
  });

  it("passes on the engine's refusal", async () => {
    const { host } = setup(
      [],
      {},
      {
        runsHarnesses: false,
        startRun: async () => {
          throw new Error("can't start yet");
        },
      },
    );

    await expect(host.startRun?.({ hubId: "acme", id: "reply" }, {})).rejects.toThrow(
      "can't start yet",
    );
  });

  it("says from the unsaved files why the engine would refuse the run, and the next step", async () => {
    const { host, store } = setup(
      [],
      {},
      { runsHarnesses: false, startRun: async () => ({ id: "run-1" }) },
    );
    const ref = { hubId: "acme", id: "reply" };
    expect(await host.startRefusal?.(ref)).toBeUndefined();

    store["hubs/acme/workflows/reply.workflow.yaml"] =
      "id: reply\nname: Reply\ninitial: write\nstates:\n  write:\n    agent: writer\n    on:\n      - to: done\n  done:\n    type: final\n";
    store["hubs/acme/agents/writer.agent.yaml"] = "id: writer\nname: Writer\nharness: codex\n";

    expect(await host.startRefusal?.(ref)).toEqual({
      reason: "Writer runs in Codex, which Halonic can't start yet.",
      fix: "Set Writer to Halonic on its Harness page to run it now.",
      command: undefined,
    });
  });

  it("doesn't refuse an agent in a harness program where an agent host runs", async () => {
    const { host, store } = setup(
      [],
      {},
      { runsHarnesses: true, startRun: async () => ({ id: "run-1" }) },
    );
    store["hubs/acme/workflows/reply.workflow.yaml"] =
      "id: reply\nname: Reply\ninitial: write\nstates:\n  write:\n    agent: writer\n    on:\n      - to: done\n  done:\n    type: final\n";
    store["hubs/acme/agents/writer.agent.yaml"] = "id: writer\nname: Writer\nharness: codex\n";

    expect(await host.startRefusal?.({ hubId: "acme", id: "reply" })).toBeUndefined();
  });

  it("offers no startRefusal while the page has no engine", () => {
    expect(setup().host.startRefusal).toBeUndefined();
  });
});
