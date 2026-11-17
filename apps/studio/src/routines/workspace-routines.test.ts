import type { RunSummary } from "@halonicjs/events";
import { KindedError } from "@halonicjs/std";
import { EngineNotAnswering, NothingToRun } from "@halonicjs/studio-feature-routines/api";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { WorkspaceRoutines, type WorkspaceRoutinesParts } from "./workspace-routines.ts";

const analystFile = "id: analyst\nname: Analyst\nmodel: fast\ninstructions: Report.\n";
const replyFile = "id: reply\nname: Reply\ninitial: first\nstates:\n  first:\n    type: final\n";
const weeklyFile = [
  "# Sent to the team.",
  "name: Weekly report",
  "trigger:",
  '  schedule: "0 9 * * 1"',
  "  timezone: Europe/Amsterdam",
  "run:",
  "  agent: analyst",
  "  prompt: Write the report.",
  "",
].join("\n");
const weekly = { hubId: "acme", id: "weekly-report" } as const;
const now = new Date("2026-11-17T08:00:00Z");

function setup(
  extra: Partial<WorkspaceRoutinesParts> = {},
  runs: Partial<RunSummary>[] = [],
  hub: Record<string, string> = {},
) {
  const store: Record<string, string> = {
    "hubs/acme/hub.yaml": "id: acme\nname: Acme\n",
    "hubs/beta/hub.yaml": "id: beta\nname: Beta\n",
    "hubs/acme/agents/analyst.agent.yaml": analystFile,
    "hubs/acme/workflows/reply.workflow.yaml": replyFile,
    "hubs/acme/workflows/routines/weekly-report.routine.yaml": weeklyFile,
    ...hub,
  };
  const changes: { label: string; changes: Record<string, string | null> }[] = [];
  const fileListeners = new Set<() => void>();
  const runListeners = new Set<() => void>();
  const host = new WorkspaceRoutines({
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
    timeZone: "UTC",
    now: () => now,
    ...extra,
  });
  return { store, changes, fileListeners, runListeners, host };
}

const weeklyRun = {
  kind: "run",
  trigger: { type: "schedule", routineId: "acme/weekly-report", at: "2026-11-16T08:00:00Z" },
} as const;

verifies("studio.workspace-routines", () => {
  it("lists a routine with its words, its target and its next time", async () => {
    const { host } = setup();
    expect(await host.list()).toEqual([
      expect.objectContaining({
        hubId: "acme",
        id: "weekly-report",
        name: "Weekly report",
        enabled: true,
        summary: "Mondays at 09:00 (Europe/Amsterdam) → Analyst",
        nextRun: "2026-11-23T08:00:00.000Z",
        needsYou: 0,
      }),
    ]);
    expect(host.hubs().map((hub) => hub.id)).toEqual(["acme", "beta"]);
    expect(host.nameOf(weekly)).toBe("Weekly report");
  });

  it("counts the runs that wait, and gives an off routine no next time", async () => {
    const { host } = setup(
      {},
      [{ ...weeklyRun, status: "waiting", startedAt: "2026-11-16T08:00:00Z" }],
      {
        "hubs/acme/workflows/routines/weekly-report.routine.yaml": weeklyFile.replace(
          "name: Weekly",
          "enabled: false\nname: Weekly",
        ),
      },
    );
    const [row] = await host.list();
    expect(row?.needsYou).toBe(1);
    expect(row?.nextRun).toBeUndefined();
    expect(await host.nextTimes(weekly, 3)).toEqual({ times: [], atNextCheck: false });
  });

  it("lists a routine with a schedule that doesn't parse, with its problem", async () => {
    const { host } = setup({}, [], {
      "hubs/acme/workflows/routines/broken.routine.yaml": weeklyFile.replace("0 9 * * 1", "nope"),
    });
    const listed = (await host.list()).find((row) => row.id === "broken");
    expect(listed?.nextRun).toBeUndefined();
    const view = await host.read({ hubId: "acme", id: "broken" });
    expect(view.problems.length).toBeGreaterThan(0);
  });

  it("reads a routine as the page draws it", async () => {
    const { host } = setup();
    const view = await host.read(weekly);
    expect(view).toMatchObject({
      summary: "Mondays at 09:00 (Europe/Amsterdam) → Analyst",
      trigger: { kind: "schedule", cron: "0 9 * * 1", timeZone: "Europe/Amsterdam" },
      target: { kind: "agent", hubId: "acme", id: "analyst", prompt: "Write the report." },
      targetState: "ready",
      overlap: "skip",
      catchUp: "last",
      file: "hubs/acme/workflows/routines/weekly-report.routine.yaml",
      everLive: true,
      changesNotLive: false,
    });
  });

  it("rejects a routine the workspace doesn't have as not found", async () => {
    const { host } = setup();
    await expect(host.read({ hubId: "acme", id: "gone" })).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("writes a change as an edit that keeps the file's comments", async () => {
    const { host, store, changes } = setup();
    await host.save(weekly, { name: "Monday report", enabled: false, overlap: "queue" });
    const text = store["hubs/acme/workflows/routines/weekly-report.routine.yaml"];
    expect(text).toContain("# Sent to the team.");
    expect(text).toContain("Monday report");
    expect(text).toContain("enabled: false");
    expect(text).toContain("overlap: queue");
    expect(changes).toHaveLength(1);
    expect(host.nameOf(weekly)).toBe("Monday report");
  });

  it("writes a new trigger and a new target", async () => {
    const { host } = setup();
    await host.save(weekly, {
      trigger: { kind: "every", interval: "15m" },
      target: { kind: "workflow", hubId: "acme", id: "reply", input: '{"a":1}' },
    });
    const view = await host.read(weekly);
    expect(view.trigger).toEqual({ kind: "every", interval: "15m" });
    expect(view.target).toMatchObject({ kind: "workflow", id: "reply", input: '{\n  "a": 1\n}' });
  });

  it("refuses an input that isn't a JSON object, and writes nothing", async () => {
    const { host, changes } = setup();
    await expect(
      host.save(weekly, { target: { kind: "workflow", hubId: "acme", id: "reply", input: "[1]" } }),
    ).rejects.toThrow(SyntaxError);
    expect(changes).toEqual([]);
  });

  it("lists the next times of a schedule, and of an interval once it has run", async () => {
    const { host } = setup();
    const { times } = await host.nextTimes(weekly, 2);
    expect(times).toEqual(["2026-11-23T08:00:00.000Z", "2026-11-30T08:00:00.000Z"]);
    const every = {
      "hubs/acme/workflows/routines/poll.routine.yaml": weeklyFile.replace(
        /schedule:.*\n {2}timezone:.*\n/,
        "every: 1h\n",
      ),
    };
    const poll = { hubId: "acme", id: "poll" };
    expect(await setup({}, [], every).host.nextTimes(poll, 2)).toEqual({
      times: [],
      atNextCheck: true,
    });
    const ran = [
      {
        kind: "run" as const,
        status: "completed" as const,
        startedAt: "2026-11-17T07:00:00Z",
        trigger: { type: "every" as const, routineId: "acme/poll", at: "2026-11-17T07:00:00Z" },
      },
    ];
    expect((await setup({}, ran, every).host.nextTimes(poll, 2)).times).toEqual([
      "2026-11-17T09:00:00.000Z",
      "2026-11-17T10:00:00.000Z",
    ]);
  });

  it("lists the newest runs, newest first, with the skipped times", async () => {
    const { host } = setup(
      {
        skips: async () => [
          { reason: "missed", from: "2026-11-09T08:00:00Z", to: "2026-11-09T08:00:00Z", count: 1 },
          {
            reason: "target-unavailable",
            why: "in-trash",
            from: "2026-11-02T08:00:00Z",
            to: "2026-11-02T08:00:00Z",
            count: 1,
          },
        ],
      },
      [
        { ...weeklyRun, id: "old", status: "completed", startedAt: "2026-11-09T08:00:00Z" },
        { ...weeklyRun, id: "new", status: "failed", startedAt: "2026-11-16T08:00:00Z" },
        { kind: "run", id: "other", status: "completed", startedAt: "2026-11-16T09:00:00Z" },
      ],
    );
    const { runs, skips } = await host.runs(weekly);
    expect(runs.map((run) => [run.runId, run.outcome, run.startedBy])).toEqual([
      ["new", "failed", "schedule"],
      ["old", "completed", "schedule"],
    ]);
    expect(skips.map((skip) => skip.reason)).toEqual(["missed", "target-in-trash"]);
  });

  it("deletes a routine into the trash as one change", async () => {
    const { host, store, changes } = setup();
    await host.trash(weekly);
    expect(store["hubs/acme/workflows/routines/weekly-report.routine.yaml"]).toBeUndefined();
    expect(changes).toEqual([
      {
        label: "Deleted routine Weekly report",
        changes: { "hubs/acme/workflows/routines/weekly-report.routine.yaml": null },
      },
    ]);
  });

  it("creates a manual routine that runs the hub's first workflow", async () => {
    const { host, store } = setup();
    const ref = await host.create({ name: "Morning check", hubId: "acme" });
    expect(ref).toEqual({ hubId: "acme", id: "morning-check" });
    const view = await host.read(ref);
    expect(view.trigger).toEqual({ kind: "manual" });
    expect(view.target).toMatchObject({ kind: "workflow", id: "reply", input: "{}" });
    expect(store["hubs/acme/workflows/routines/morning-check.routine.yaml"]).toContain(
      '"Morning check"',
    );
    expect((await host.create({ name: "Morning check", hubId: "acme" })).id).toBe(
      "morning-check-2",
    );
  });

  it("creates a routine that runs the first agent when the hub has no workflow", async () => {
    const { host, store } = setup();
    delete store["hubs/acme/workflows/reply.workflow.yaml"];
    const view = await host.read(await host.create({ name: "Check", hubId: "acme" }));
    expect(view.target).toMatchObject({ kind: "agent", prompt: "Describe what to do." });
  });

  it("names what a new routine would run: the first workflow, else the first agent, else nothing", async () => {
    const { host, store } = setup();
    expect(await host.starterTarget("acme")).toMatchObject({ kind: "workflow", id: "reply" });
    delete store["hubs/acme/workflows/reply.workflow.yaml"];
    expect(await host.starterTarget("acme")).toMatchObject({ kind: "agent" });
    expect(await host.starterTarget("beta")).toBeUndefined();
  });

  it("refuses a hub with nothing to run, or a hub the workspace doesn't have, and writes nothing", async () => {
    const { host, changes } = setup();
    await expect(host.create({ name: "Check", hubId: "beta" })).rejects.toThrow(NothingToRun);
    await expect(host.create({ name: "Check", hubId: "zed" })).rejects.toThrow("no hub");
    expect(changes).toEqual([]);
  });

  it("lists the routines that start an owner, and adds one named after it", async () => {
    const { host } = setup();
    expect(
      (await host.startingRoutines({ kind: "agent", hubId: "acme", id: "analyst" })).map(
        (row) => row.id,
      ),
    ).toEqual(["weekly-report"]);
    expect(await host.startingRoutines({ kind: "workflow", hubId: "acme", id: "reply" })).toEqual(
      [],
    );
    const ref = await host.addTrigger({ kind: "workflow", hubId: "acme", id: "reply" });
    expect(ref.id).toBe("reply");
    expect(
      await host.startingRoutines({ kind: "workflow", hubId: "acme", id: "reply" }),
    ).toHaveLength(1);
  });

  it("starts the target through the engine, and refuses what can't start", async () => {
    const started: unknown[] = [];
    const { host } = setup({
      engine: {
        start: async (target, trigger) => {
          started.push([target.id, trigger.routineKey]);
          return { id: "run-1" };
        },
      },
    });
    expect(await host.runNow?.(weekly)).toEqual({ started: true, runId: "run-1" });
    expect(started).toEqual([["analyst", "acme/weekly-report"]]);

    const gone = setup({ engine: { start: async () => ({ id: "x" }) } }, [], {
      "hubs/acme/workflows/routines/lost.routine.yaml": weeklyFile.replace("analyst", "nobody"),
    });
    expect(await gone.host.runNow?.({ hubId: "acme", id: "lost" })).toEqual({
      started: false,
      refusal: { reason: "target-not-found" },
    });
    const untrusted = setup({
      trusted: async () => false,
      engine: { start: async () => ({ id: "x" }) },
    });
    expect(await untrusted.host.runNow?.(weekly)).toEqual({
      started: false,
      refusal: { reason: "not-trusted" },
    });
    expect((await untrusted.host.list())[0]?.pausedUntilTrusted).toBe(true);
  });

  it("says the engine isn't answering when it can't be reached, and has no Run now without one", async () => {
    const down = setup({
      engine: {
        start: async () => {
          throw new KindedError("unavailable", "closed");
        },
      },
    });
    await expect(down.host.runNow?.(weekly)).rejects.toThrow(EngineNotAnswering);
    expect(setup().host.runNow).toBeUndefined();
  });

  it("tells a subscriber when a file changed or a run started, and not after it stopped", () => {
    const { host, fileListeners, runListeners } = setup();
    let heard = 0;
    const stop = host.subscribe(() => heard++);
    for (const listener of [...fileListeners, ...runListeners]) listener();
    expect(heard).toBe(2);
    stop();
    expect(fileListeners.size + runListeners.size).toBe(0);
  });
});
