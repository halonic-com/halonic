import { TauriRunStore } from "@halonicjs/adapter-fs-tauri";
import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import { placedRoutines } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import { createEngineServer } from "@halonicjs/host-server";
import type { Clock, IdGenerator, RunExecutor } from "@halonicjs/ports";
import { tauriEngineFetch } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { describe, expect, it, vi } from "vitest";
import { fakeShell, location, serviceOn } from "./engine-service.testing.ts";
import { RemoteEngine } from "./remote-engine.ts";

// The contract every engine a window reaches keeps, whichever it is: the page's own
// `EngineService`, or the background engine as `RemoteEngine` reaches it through the shell
// (B1 step 4, HAL-14219). One suite, run against each, so the two can't drift apart.

/** What the window's hosts call on its engine: the Workflows and Routines pages, and the Inbox. */
type StudioEngine = Pick<RemoteEngine, "startRun" | "startRoutine" | "send" | "cancel" | "waiting">;

/** One engine under the contract, on {@link contractFiles}. */
interface ContractEngine {
  readonly engine: StudioEngine;
  /** A run as the engine recorded it, as the Runs list reads it. */
  run(runId: string): Promise<RunSummary | null>;
  close(): Promise<void>;
}

/**
 * Acme's `support` hub: `review` waits at its step `review` for `approve` or `reject`, and the
 * routine `nightly` runs it.
 */
function contractFiles(): MemoryDefinitionStore {
  return new MemoryDefinitionStore({
    "workspace.yaml": "id: acme\nname: Acme\n",
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    "hubs/support/workflows/review.workflow.yaml": [
      "id: review",
      "name: Review",
      "initial: review",
      "states:",
      "  review:",
      "    type: wait",
      "    on:",
      "      - to: done",
      "        event: approve",
      "      - to: done",
      "        event: reject",
      "  done:",
      "    type: final",
      "",
    ].join("\n"),
    "hubs/support/workflows/routines/nightly.routine.yaml": [
      "id: nightly",
      "name: Nightly review",
      'trigger: { schedule: "0 8 * * *" }',
      "run: { workflow: review }",
      "",
    ].join("\n"),
  });
}

const review = { hubId: "support", workflowId: "review" } as const;

/** The run `runId` once it waits, as the engine recorded it. */
async function waitingRun(open: ContractEngine, runId: string): Promise<RunSummary> {
  return vi.waitFor(async () => {
    const run = await open.run(runId);
    expect(run?.status).toBe("waiting");
    return run as RunSummary;
  });
}

/** The tests every engine a window reaches passes; `make` opens a fresh one for each. */
function studioEngineContract(make: () => Promise<ContractEngine>): void {
  it("starts a run of a workflow with its input, and records it as the person's own", async () => {
    const open = await make();

    const { id } = await open.engine.startRun(review, { topic: "tea" });

    const run = await waitingRun(open, id);
    expect(run).toMatchObject({ hubId: "support", workflowId: "review", state: "review" });
    expect(run.trigger).toMatchObject({ type: "manual" });
    await open.close();
  });

  it("runs a routine now, and its run names the routine", async () => {
    const open = await make();
    const at = "2026-11-21T08:00:00.000Z";

    const { id } = await open.engine.startRoutine(
      { workflow: { ...review, input: {} } },
      { routineKey: "support/nightly", at },
    );

    const run = await waitingRun(open, id);
    expect(run.trigger).toMatchObject({ type: "manual", routineId: "support/nightly" });
    await open.close();
  });

  it("lists the runs that wait for a person", async () => {
    const open = await make();
    const { id } = await open.engine.startRun(review, {});
    await waitingRun(open, id);

    const waiting = await open.engine.waiting();

    expect(waiting.map((run) => run.id)).toEqual([id]);
    await open.close();
  });

  it("takes the first answer to a wait step, and refuses a later one for the same step", async () => {
    const open = await make();
    const { id } = await open.engine.startRun(review, {});
    const { state, lastWaitingAt } = await waitingRun(open, id);
    const wait = { state: state ?? "", since: lastWaitingAt ?? "" };

    const first = await open.engine.send(id, "approve", undefined, { wait });
    const late = await open.engine.send(id, "reject", undefined, { wait }).catch((e: unknown) => e);

    expect(first).toMatchObject({ id, status: "completed" });
    // Each words the refusal its own way: the page's engine throws the run's `InputRefused`, and
    // the background engine answers 409, a `conflict`.
    expect(late).toBeInstanceOf(Error);
    expect(await open.run(id)).toMatchObject({ status: "completed", state: "done" });
    await open.close();
  });

  it("cancels a run that waits, which ends it as failed", async () => {
    const open = await make();
    const { id } = await open.engine.startRun(review, {});
    await waitingRun(open, id);

    await open.engine.cancel(id);

    expect(await open.run(id)).toMatchObject({ status: "failed" });
    expect(await open.engine.waiting()).toEqual([]);
    await open.close();
  });
}

const clock: Clock = { now: () => new Date("2026-11-21T08:00:00.000Z") };

/** Run ids `run1`, `run2`, …, so every run of a test has its own. */
function countingIds(): IdGenerator {
  let count = 0;
  return { next: (prefix) => `${prefix}${++count}` };
}

/** The page's own engine on Acme's files, with the run store the Runs list reads. */
function pageEngine(files: MemoryDefinitionStore) {
  const shell = fakeShell();
  const service = serviceOn(shell, files, { ids: countingIds(), clock });
  return { service, runs: new TauriRunStore(shell.ipc, location) };
}

/** The window's own engine, as the hosts reach it without a background engine. */
async function windowEngine(): Promise<ContractEngine> {
  const { service, runs } = pageEngine(contractFiles());
  return {
    engine: {
      startRun: (run, input) => service.startRun(run, input),
      startRoutine: (start, trigger) => service.startRoutine(start, trigger),
      send: (...answer) => service.send(...answer),
      cancel: async (runId) => {
        const { executor } = await service.open();
        if (executor.cancel === undefined) throw new Error("The page's engine can't cancel.");
        return executor.cancel(runId);
      },
      // As `WorkspaceRuns.waiting` reads them when no background engine runs.
      waiting: () => runs.list({ status: ["waiting"] }),
    },
    run: (runId) => runs.get(runId),
    close: () => service.close(),
  };
}

/**
 * What the engine role does with a start that names no trigger (design note D3 on HAL-14206,
 * point 3): records it as `manual`, on its own clock, on the saved files. The role that serves
 * the engine's routes isn't built yet (HAL-14217), so this stands in for it.
 */
function manualStarts(executor: RunExecutor): RunExecutor {
  const { cancel } = executor;
  return {
    id: executor.id,
    start: (request) =>
      executor.start({
        trigger: { type: "manual", at: clock.now().toISOString() },
        version: { reads: "saved-files" },
        ...request,
      }),
    startAgent: (request) => executor.startAgent(request),
    send: (...answer) => executor.send(...answer),
    subscribe: (...follow) => executor.subscribe(...follow),
    chatTurn: (...turn) => executor.chatTurn(...turn),
    ...(cancel === undefined ? {} : { cancel: (runId: string) => cancel.call(executor, runId) }),
  };
}

const launchToken = "acme-launch-token-0123456789-abcdefghijklmno";
const enginePort = 41234;

/**
 * The background engine: the engine server's routes over a page engine of its own, reached as a
 * window reaches it, through `tauriEngineFetch` and a shell that builds each route's path from its
 * params and adds the launch token, as `engine_request` does in Rust.
 */
async function backgroundEngine(): Promise<ContractEngine> {
  const files = contractFiles();
  const { service, runs } = pageEngine(files);
  const failures: unknown[] = [];
  const server = createEngineServer({
    launchToken,
    port: () => enginePort,
    maxBodyBytes: 1024 * 1024,
    ports: {
      runs: manualStarts((await service.open()).executor),
      runStore: runs,
      trust: { check: async () => ({ state: "trusted", message: "Trusted." }) },
      // The send route logs each answer it refuses, on purpose; the refusal shows in its answer.
      errorLog: { record: () => {} },
      clock,
      routines: { list: async () => placedRoutines(await loadWorkspace(files)), timeZone: "UTC" },
      runUpdates: { follow: () => () => {} },
    },
  });
  const shell = {
    invoke: async (command: string, args: Record<string, unknown> = {}) => {
      if (command !== "engine_request") throw { kind: "unknown_command", message: command };
      const [method = "", route = ""] = String(args["route"]).split(" ");
      const params = (args["params"] ?? {}) as Record<string, string>;
      const path = route.replace(/\{(\w+)\}/g, (_, name: string) =>
        encodeURIComponent(params[name] ?? ""),
      );
      const response = await server.handle(
        new Request(`http://127.0.0.1:${enginePort}${path}`, {
          method,
          headers: {
            host: `127.0.0.1:${enginePort}`,
            authorization: `Bearer ${launchToken}`,
            "content-type": "application/json",
          },
          ...(method === "POST" ? { body: JSON.stringify(args["body"] ?? {}) } : {}),
        }),
      );
      const text = await response.text();
      return { status: response.status, body: text === "" ? null : JSON.parse(text) };
    },
    transformCallback: () => 1,
    unregisterCallback: () => {},
  };
  const engine = new RemoteEngine({
    fetch: tauriEngineFetch(shell),
    reportError: (error) => failures.push(error),
  });
  return {
    engine,
    run: (runId) => runs.get(runId),
    close: async () => {
      await service.close();
      if (failures.length > 0) throw new AggregateError(failures, "A stream of the engine failed.");
    },
  };
}

verifies("studio.engine-contract", () => {
  describe("the window's own engine", () => studioEngineContract(windowEngine));
  describe("the background engine, through the shell", () =>
    studioEngineContract(backgroundEngine));
});
