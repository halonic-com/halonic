import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import { shortRunId } from "@halonicjs/app";
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

function acmeFiles(currency = "USD", monthly?: number): MemoryDefinitionStore {
  const limit = monthly === undefined ? "" : `  monthly: ${monthly}\n`;
  return new MemoryDefinitionStore({
    "workspace.yaml": `id: acme\nname: Acme\nbudget:\n  currency: ${currency}\n${limit}`,
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

  it("names an agent as its file does, and not one the workspace doesn't have", async () => {
    const { engine } = await waitingRun();
    const definitions = new MemoryDefinitionStore({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "agents/handbook-reader.agent.yaml":
        "id: handbook-reader\nname: Handbook reader\nmodel: mock\ninstructions: Read.\n",
    });
    const runs = new WorkspaceRuns({ runs: engine.stores.store, definitions });
    await runs.list();
    expect(runs.agentName("handbook-reader")).toBe("Handbook reader");
    expect(runs.agentName("gone")).toBeUndefined();
  });

  it("names a hub as its file does, and not one the workspace doesn't have", async () => {
    const { engine } = await waitingRun();
    const definitions = new MemoryDefinitionStore({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "hubs/reports/hub.yaml": "id: reports\nname: Reports\n",
    });
    const runs = new WorkspaceRuns({ runs: engine.stores.store, definitions });
    await runs.list();
    expect(runs.hubName("reports")).toBe("Reports");
    expect(runs.hubName("gone")).toBeUndefined();
  });

  it("names the workflows as `halonic run` takes them, in the Workflows list's order", async () => {
    const { engine } = await waitingRun();
    const workflow = (id: string, name: string) =>
      `id: ${id}\nname: ${name}\ninitial: done\nstates:\n  done:\n    type: final\n`;
    const definitions = new MemoryDefinitionStore({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "hubs/acme/hub.yaml": "id: acme\nname: Acme\n",
      "hubs/acme/workflows/welcome.workflow.yaml": workflow("welcome", "Welcome"),
      "hubs/acme/workflows/reply.workflow.yaml": workflow("reply", "Support reply"),
      "hubs/sales/hub.yaml": "id: sales\nname: Sales\n",
      "hubs/sales/workflows/reply.workflow.yaml": workflow("reply", "Sales reply"),
    });
    const runs = new WorkspaceRuns({ runs: engine.stores.store, definitions });
    const empty = new WorkspaceRuns({
      runs: engine.stores.store,
      definitions: new MemoryDefinitionStore({ "workspace.yaml": "id: new\nname: New\n" }),
    });

    expect(await runs.runnableWorkflows()).toEqual(["acme/reply", "welcome", "sales/reply"]);
    expect(await empty.runnableWorkflows()).toEqual([]);
  });

  it("says whether a provider runs on this computer, and nothing for one the workspace lacks", async () => {
    const { engine } = await waitingRun();
    const definitions = new MemoryDefinitionStore({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "providers/mock.yaml": "id: mock\nname: Mock\ntype: mock\n",
      "providers/ollama.yaml": "id: ollama\nname: Ollama\ntype: ollama\nlocal: true\n",
      "providers/claude.yaml": "id: claude\nname: Claude\ntype: anthropic\nsecret: anthropic-key\n",
    });
    const runs = new WorkspaceRuns({ runs: engine.stores.store, definitions });

    await runs.list();

    expect(runs.providerKind("mock")).toBe("local");
    expect(runs.providerKind("ollama")).toBe("local");
    expect(runs.providerKind("claude")).toBe("cloud");
    expect(runs.providerKind("gone")).toBeUndefined();
  });

  it("reads the workspace's monthly budget, and none when it sets none", async () => {
    const { engine } = await waitingRun();
    const capped = new WorkspaceRuns({
      runs: engine.stores.store,
      definitions: acmeFiles("USD", 100),
    });
    const open = new WorkspaceRuns({ runs: engine.stores.store, definitions: acmeFiles() });

    await capped.list();
    await open.list();

    expect(capped.monthlyBudget()).toBe(100);
    expect(open.monthlyBudget()).toBeUndefined();
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

  it("gives the Inbox the runs that wait, and can't answer one yet", async () => {
    const { engine, runId } = await waitingRun();
    const runs = new WorkspaceRuns({ runs: engine.stores.store, definitions: acmeFiles() });

    expect((await runs.waiting()).map((run) => run.id)).toEqual([runId]);
    await expect(runs.send(runId, "approve")).rejects.toMatchObject({
      kind: "unavailable",
      message: "Studio can't answer runs yet. To answer this one, run this in a terminal:",
      fix: `halonic runs send ${shortRunId(runId)} approve`,
    });
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

verifies("studio.run-log", () => {
  it("reads a run's whole log", async () => {
    const { engine, runId } = await waitingRun();
    const runs = new WorkspaceRuns({ runs: engine.stores.store, definitions: acmeFiles() });

    const listed = await runs.list();
    const log = await runs.log(runId);

    expect(log[0]?.type).toBe("run.started");
    expect(log.at(-1)?.seq).toBe(listed[0]?.summary.lastSeq);
  });
});
