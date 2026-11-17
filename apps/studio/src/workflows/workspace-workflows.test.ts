import type { RunEvent, RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { WorkspaceWorkflows, type WorkspaceWorkflowsParts } from "./workspace-workflows.ts";

const replyFile = "id: reply\nname: Reply\ninitial: first\nstates:\n  first:\n    type: final\n";

function setup(
  runs: Partial<RunSummary>[] = [],
  logs: Record<string, RunEvent[]> = {},
  engine?: WorkspaceWorkflowsParts["engine"],
  settle?: WorkspaceWorkflowsParts["settle"],
) {
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
      log: async (runId) => logs[runId] ?? [],
    },
    ...(engine === undefined ? {} : { engine }),
    ...(settle === undefined ? {} : { settle }),
  });
  return { store, changes, fileListeners, runListeners, host };
}

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

  it("knows a workflow's name once it has read or made it, for the tab and the page title", async () => {
    const { host } = setup();
    expect(host.nameOf({ hubId: "acme", id: "invoice-intake" })).toBeUndefined();

    await host.create({ name: "Invoice intake", hubId: "acme" });
    expect(host.nameOf({ hubId: "acme", id: "invoice-intake" })).toBe("Invoice intake");

    const [first] = await host.list();
    if (first === undefined) throw new Error("no workflow listed");
    expect(host.nameOf(first)).toBe(first.name);
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

verifies("studio.workspace-workflow-read", () => {
  it("reads one workflow's steps, arrows and places, with unsaved changes applied", async () => {
    const { host, store } = setup();
    store["hubs/acme/workflows/reply.workflow.yaml"] = [
      "id: reply",
      "name: Reply",
      "initial: first",
      "states:",
      "  first:",
      "    agent: writer",
      "    on:",
      "      - to: done",
      "        label: ok",
      "  done:",
      "    type: final",
      "layout:",
      "  done: { x: 5, y: 7 }",
      "",
    ].join("\n");

    expect(await host.read({ hubId: "acme", id: "reply" })).toEqual({
      hubId: "acme",
      id: "reply",
      name: "Reply",
      initial: "first",
      steps: [
        { id: "first", type: "task", agent: "writer" },
        { id: "done", type: "final", agent: undefined },
      ],
      arrows: [{ from: "first", to: "done", label: "ok" }],
      layout: { done: { x: 5, y: 7 } },
    });
  });

  it("refuses a workflow the hub doesn't have as not found", async () => {
    const { host } = setup();
    await expect(host.read({ hubId: "acme", id: "gone" })).rejects.toThrow(
      "This workflow isn't in this workspace any more.",
    );
  });

  it("gives a workflow's settings and the problems of its file, each with its step", async () => {
    const { host, store } = setup();
    store["hubs/acme/workflows/reply.workflow.yaml"] =
      "id: reply\nname: Reply\ndescription: Answers\ninitial: first\nstates:\n  first:\n    on:\n      - to: nowhere\n";

    const settings = await host.configuration({ hubId: "acme", id: "reply" });

    expect(settings).toMatchObject({
      name: "Reply",
      description: "Answers",
      initial: "first",
      stepIds: ["first"],
      file: "hubs/acme/workflows/reply.workflow.yaml",
    });
    expect(settings.problems.map(({ code, stepId }) => ({ code, stepId }))).toContainEqual({
      code: "unknown-target",
      stepId: "first",
    });
  });

  it("gives the request form's one field by name only, without a made-up type or flag", async () => {
    const { host, store } = setup();
    store["hubs/acme/workflows/reply.workflow.yaml"] =
      "id: reply\nname: Reply\ninitial: first\nstart:\n  label: Ask a question\n  field: question\nstates:\n  first:\n    type: final\n";

    const settings = await host.configuration({ hubId: "acme", id: "reply" });

    expect(settings.request).toEqual({ label: "Ask a question", fields: [{ name: "question" }] });
  });

  it("rejects the settings of a workflow the hub doesn't have", async () => {
    await expect(setup().host.configuration({ hubId: "acme", id: "gone" })).rejects.toThrow(
      "This workflow isn't in this workspace any more.",
    );
  });

  it("lists the cases of a workflow's test file, with its input and where it should end", async () => {
    const { host, store } = setup();
    store["hubs/acme/workflows/reply.test.yaml"] =
      'version: 1\nworkflow: reply\ncases:\n  - name: spam\n    input: { subject: "Win" }\n    expect: { final: first }\n  - name: other\n';

    const tests = await host.tests({ hubId: "acme", id: "reply" });

    expect(tests.cases.map(({ name, endsIn }) => ({ name, endsIn }))).toEqual([
      { name: "spam", endsIn: "first" },
      { name: "other", endsIn: undefined },
    ]);
    expect(tests.cases[0]?.input).toBe('{\n  "subject": "Win"\n}');
    expect(tests.cases[0]?.result).toBeUndefined();
  });

  it("gives no tests for a workflow without a test file, and rejects one that isn't there", async () => {
    const { host } = setup();

    expect((await host.tests({ hubId: "acme", id: "reply" })).cases).toEqual([]);
    await expect(host.tests({ hubId: "acme", id: "gone" })).rejects.toThrow(
      "isn't in this workspace any more",
    );
  });

  describe("saving a run as a test", () => {
    const run = { ...reply, id: "r1", status: "completed", state: "first" } as const;
    const logs = (input: Record<string, unknown> = { topic: "refund" }) => ({
      r1: [{ type: "run.started", input } as unknown as RunEvent],
    });

    it("makes the test file when the workflow has none", async () => {
      const { host, store, changes } = setup([run], logs());

      await host.saveRunAsTest({ hubId: "acme", id: "reply" }, "r1", "Refund");

      expect(changes).toHaveLength(1);
      expect(store["hubs/acme/workflows/reply.test.yaml"]).toBe(
        [
          "version: 1",
          "workflow: reply",
          "cases:",
          "  - name: Refund",
          "    input:",
          "      topic: refund",
          "    expect:",
          "      final: first",
          "",
        ].join("\n"),
      );
      expect((await host.tests({ hubId: "acme", id: "reply" })).cases).toEqual([
        { name: "Refund", input: '{\n  "topic": "refund"\n}', endsIn: "first" },
      ]);
    });

    it("adds the case after the ones the file has and keeps its comments", async () => {
      const { host, store } = setup([run], logs());
      store["hubs/acme/workflows/reply.test.yaml"] = [
        "version: 1",
        "workflow: reply",
        "cases:",
        "  # the happy path",
        "  - name: Happy",
        "    expect:",
        "      final: first",
        "",
      ].join("\n");

      await host.saveRunAsTest({ hubId: "acme", id: "reply" }, "r1", "Refund");

      const text = store["hubs/acme/workflows/reply.test.yaml"] ?? "";
      expect(text).toContain("# the happy path");
      expect(
        (await host.tests({ hubId: "acme", id: "reply" })).cases.map((one) => one.name),
      ).toEqual(["Happy", "Refund"]);
    });

    it("rejects a name another case has, and changes nothing", async () => {
      const { host, changes } = setup([run], logs());
      await host.saveRunAsTest({ hubId: "acme", id: "reply" }, "r1", "Refund");

      await expect(
        host.saveRunAsTest({ hubId: "acme", id: "reply" }, "r1", "Refund"),
      ).rejects.toThrow('already has a test case called "Refund"');
      expect(changes).toHaveLength(1);
    });

    it("rejects a run it has no log for, a run of another workflow and a run with no step", async () => {
      const { host, changes } = setup(
        [run, { ...run, id: "r2", workflowId: "other" }, { ...run, id: "r3", state: null }],
        { ...logs(), r2: logs().r1, r3: logs().r1 },
      );
      const ref = { hubId: "acme", id: "reply" };

      await expect(host.saveRunAsTest(ref, "nope", "A")).rejects.toThrow("no log");
      await expect(host.saveRunAsTest(ref, "r2", "A")).rejects.toThrow("not a run of");
      await expect(host.saveRunAsTest(ref, "r3", "A")).rejects.toThrow("no step");
      expect(changes).toEqual([]);
    });

    it("rejects a workflow the hub doesn't have", async () => {
      const { host } = setup([run], logs());

      await expect(host.saveRunAsTest({ hubId: "acme", id: "gone" }, "r1", "A")).rejects.toThrow(
        "isn't in this workspace any more",
      );
    });
  });

  it("offers no startRun while the page has no engine", () => {
    expect(setup().host.startRun).toBeUndefined();
  });

  it("starts a run through the engine and returns the run's id", async () => {
    const started: unknown[] = [];
    const { host } = setup(
      [],
      {},
      {
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
        startRun: async () => {
          throw new Error("can't start yet");
        },
      },
    );

    await expect(host.startRun?.({ hubId: "acme", id: "reply" }, {})).rejects.toThrow(
      "can't start yet",
    );
  });
});
