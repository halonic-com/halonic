import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import type { RunEvent } from "@halonicjs/events";
import type { RunStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { publishCall, realEngine, replyStart, textAnswer } from "../inbox/real-runs.test-helper.ts";
import { type PollTimer, runsPollInterval, WorkspaceRuns } from "./workspace-runs.ts";

/** Acme's reply workflow as its file says it, with a description on the review step. */
const replyFile = [
  "id: reply",
  "name: Reply to a customer",
  "initial: draft",
  "states:",
  "  draft:",
  "    type: final",
  "  review:",
  "    type: final",
  "    description: A person reads the reply",
  "",
].join("\n");

function acmeFiles(currency = "USD"): MemoryDefinitionStore {
  return new MemoryDefinitionStore({
    "workspace.yaml": `id: acme\nname: Acme\nbudget:\n  currency: ${currency}\n`,
    "hubs/acme/hub.yaml": "id: acme\nname: Acme\n",
    "hubs/acme/workflows/reply.workflow.yaml": replyFile,
    "hubs/acme/workflows/routines/morning.routine.yaml": [
      "id: morning",
      "name: Morning replies",
      'trigger: { schedule: "0 8 * * 1-5", timezone: Europe/Amsterdam }',
      "run: { workflow: reply }",
    ].join("\n"),
  });
}

/** A timer the test ticks by hand. */
function manualTimer() {
  const ticks = new Set<() => void>();
  const timer: PollTimer = {
    every: (ms, tick) => {
      expect(ms).toBe(runsPollInterval);
      ticks.add(tick);
      return () => ticks.delete(tick);
    },
  };
  return {
    timer,
    running: () => ticks.size,
    tick: () => {
      for (const tick of ticks) tick();
    },
  };
}

/** Waits for the polls the test started to finish reading the runs. */
async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** A run of the reply workflow waiting at its `publish` call. */
async function waitingRun() {
  const engine = realEngine([publishCall, textAnswer("Done.")]);
  const { id } = await engine.executor.start(replyStart);
  await engine.settle(id);
  return { engine, runId: id };
}

verifies("studio.workspace-runs", () => {
  it("lists the workspace's runs with their workflow's name, steps and currency", async () => {
    const { engine, runId } = await waitingRun();
    const runs = new WorkspaceRuns({ runs: engine.stores.store, definitions: acmeFiles() });

    const listed = await runs.list();

    expect(listed).toMatchObject([{ summary: { id: runId, status: "waiting" } }]);
    expect(runs.workflow("acme", "reply")?.name).toBe("Reply to a customer");
    expect(runs.workflow("acme", "reply")?.stepDescription("review")).toBe(
      "A person reads the reply",
    );
    expect(runs.workflow("acme", "gone")).toBeUndefined();
    expect(runs.currency()).toBe("USD");
  });

  it("names the routine a run's trigger names, and says when it runs", async () => {
    const { engine } = await waitingRun();
    const runs = new WorkspaceRuns({ runs: engine.stores.store, definitions: acmeFiles() });

    await runs.list();

    expect(runs.routine("acme/morning")).toEqual({
      name: "Morning replies",
      schedule: "Weekdays at 08:00",
    });
    expect(runs.routine("acme/gone")).toBeUndefined();
  });

  it("reads a run's log again only when it grew", async () => {
    const { engine, runId } = await waitingRun();
    const events = vi.spyOn(engine.stores.store, "events");
    const runs = new WorkspaceRuns({ runs: engine.stores.store, definitions: acmeFiles() });

    await runs.list();
    await runs.list();
    expect(events).toHaveBeenCalledTimes(1);

    const [call] = (await runs.waiting())[0]?.approvals ?? [];
    await engine.executor.send(runId, "approve", undefined, { callId: call?.callId ?? "" });
    await engine.settle(runId);
    events.mockClear();
    await runs.list();
    await runs.list();

    expect(events).toHaveBeenCalledTimes(1);
    expect(events).toHaveBeenCalledWith(runId);
  });

  it("says a run made a tool call when its log has one, and never reads that log again", async () => {
    const { engine } = await waitingRun();
    const store = engine.stores.store;
    const withCall: Pick<RunStore, "list" | "events"> = {
      list: async (filter) =>
        (await store.list(filter)).map((run) => ({ ...run, lastSeq: run.lastSeq + reads })),
      events: async (runId) => {
        reads += 1;
        const logged = await store.events(runId);
        const toolCalled: RunEvent = {
          runId,
          seq: logged.length + 1,
          at: "2026-01-01T00:00:02.000Z",
          type: "tool.called",
          agent: "writer",
          tool: "publish",
          args: {},
        };
        return [...logged, toolCalled];
      },
    };
    let reads = 0;
    const runs = new WorkspaceRuns({ runs: withCall, definitions: acmeFiles() });

    expect((await runs.list())[0]?.madeToolCalls).toBe(true);
    expect((await runs.list())[0]?.madeToolCalls).toBe(true);
    expect(reads).toBe(1);
  });

  it("gives the Inbox the runs that wait, and can't answer one yet", async () => {
    const { engine, runId } = await waitingRun();
    const runs = new WorkspaceRuns({ runs: engine.stores.store, definitions: acmeFiles() });

    expect((await runs.waiting()).map((run) => run.id)).toEqual([runId]);
    await expect(runs.send()).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("tells its listeners when a run changed at a poll or when the window came to the front", async () => {
    const { engine, runId } = await waitingRun();
    const clock = manualTimer();
    let focus: (() => void) | undefined;
    const runs = new WorkspaceRuns({
      runs: engine.stores.store,
      definitions: acmeFiles(),
      timer: clock.timer,
      onFocus: (listener) => {
        focus = listener;
        return () => {
          focus = undefined;
        };
      },
    });
    const heard = vi.fn();
    const stop = runs.subscribe(heard);
    await settled();

    clock.tick();
    await settled();
    expect(heard).not.toHaveBeenCalled();

    const [call] = (await runs.waiting())[0]?.approvals ?? [];
    await engine.executor.send(runId, "approve", undefined, { callId: call?.callId ?? "" });
    focus?.();
    await settled();
    expect(heard).toHaveBeenCalledTimes(1);

    stop();
    expect(clock.running()).toBe(0);
    expect(focus).toBeUndefined();
  });

  it("reads the workflows again when a file changed outside", async () => {
    const { engine } = await waitingRun();
    const files = acmeFiles("EUR");
    const runs = new WorkspaceRuns({
      runs: engine.stores.store,
      definitions: files,
      timer: manualTimer().timer,
    });
    const heard = vi.fn();
    runs.subscribe(heard);
    await runs.list();
    await settled();

    files.changeOutside({
      "hubs/acme/workflows/reply.workflow.yaml": replyFile.replace("Reply to", "Answer"),
    });
    await runs.list();

    expect(heard).toHaveBeenCalledTimes(1);
    expect(runs.workflow("acme", "reply")?.name).toBe("Answer a customer");
    await runs.dispose();
    await runs.dispose();
  });

  it("keeps polling when a list fails, and tells on the next change", async () => {
    const { engine } = await waitingRun();
    const store = engine.stores.store;
    let failing = false;
    const flaky: Pick<RunStore, "list" | "events"> = {
      list: async (filter) => {
        if (failing) throw new Error("The shell didn't answer.");
        return store.list(filter);
      },
      events: (runId) => store.events(runId),
    };
    const clock = manualTimer();
    const runs = new WorkspaceRuns({ runs: flaky, definitions: acmeFiles(), timer: clock.timer });
    const heard = vi.fn();
    runs.subscribe(heard);
    await settled();

    failing = true;
    clock.tick();
    await settled();
    failing = false;
    await engine.executor.start(replyStart);
    clock.tick();
    await settled();

    expect(heard).toHaveBeenCalledTimes(1);
  });
});
