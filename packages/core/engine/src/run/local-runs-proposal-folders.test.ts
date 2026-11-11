import type { RunVersion } from "@halonicjs/events";
import type { Workflow } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import {
  type FakeStep,
  finished,
  harnessPorts,
  stillOpen,
} from "../harness/harness-test-kit.test-helper.ts";
import { KernelRuns, replyWorkflow, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";
import type { ProposalRun, RunProposalFolders } from "./proposal-folders.ts";

/**
 * Proposal folders in memory, at `<data>/proposals/<runId>`. Each `end`
 * notes how many of the harness fakes were still open when it came.
 */
class NotingFolders implements RunProposalFolders {
  readonly opened: ProposalRun[] = [];
  readonly ended: { runId: string; stillOpen: number }[] = [];
  readonly #open = new Set<string>();
  readonly #harnessSteps: readonly FakeStep[];
  /** What `open` throws, when set. */
  openError: Error | undefined;

  constructor(harnessSteps: readonly FakeStep[]) {
    this.#harnessSteps = harnessSteps;
  }

  async open(run: ProposalRun): Promise<string> {
    if (this.openError !== undefined) throw this.openError;
    this.opened.push(run);
    this.#open.add(run.runId);
    return folderOf(run.runId);
  }

  async folderOf(runId: string): Promise<string | null> {
    return this.#open.has(runId) ? folderOf(runId) : null;
  }

  async end(runId: string): Promise<void> {
    this.ended.push({ runId, stillOpen: stillOpen(this.#harnessSteps) });
    this.#open.delete(runId);
  }

  /** Removes a run's folder behind the engine's back, as a person clearing the data folder would. */
  forget(runId: string): void {
    this.#open.delete(runId);
  }
}

function folderOf(runId: string): string {
  return `<data>/proposals/${runId}`;
}

/** A parent whose one state runs the reply workflow as child run `run_1.2`. */
const onboard: Workflow = {
  version: 1,
  id: "onboard",
  name: "Onboard a customer",
  initial: "reply",
  context: {},
  states: {
    reply: {
      type: "workflow",
      workflow: "reply",
      input: { from: "{{input.from}}" },
      on: [{ to: "welcome", event: "done" }],
    },
    welcome: { type: "final", on: [] },
  },
  layout: {},
};

/** A run of the reply workflow whose writer runs in Claude Code, on noting folders. */
function writerRun(setup: { workflow?: Workflow; workflows?: Record<string, Workflow> } = {}) {
  const ports = harnessPorts();
  ports.harness.events = [finished("Dear support")];
  const folders = new NotingFolders(ports.steps);
  const run = runsOn([], new KernelRuns(), {
    agents: { writer: writerAgent("claude-code") },
    harnesses: ports.options,
    proposalFolders: folders,
    ...setup,
  });
  return { ...run, ports, folders };
}

/** The live version a start names, so its folder is made at that commit. */
const liveVersion: RunVersion = {
  reads: "live-version",
  commit: "4be1c2d",
  versionDate: "2026-11-11T08:00:00.000Z",
};

verifies("engine.run-proposal-folder", () => {
  it("opens the folder before the start, works in it, and ends it once the session has closed", async () => {
    const { executor, runs, scheduler, ports, folders } = writerRun();

    await executor.start({ ...replyStart, version: liveVersion });
    expect(folders.opened).toEqual([
      { runId: "run_1", hubId: "acme", workflowId: "reply", version: liveVersion },
    ]);
    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
    expect(ports.sandbox.profiles.map((profile) => profile.workingFolder)).toEqual([
      "<data>/proposals/run_1/files/agents/writer",
    ]);
    expect(folders.ended).toEqual([{ runId: "run_1", stillOpen: 0 }]);
  });

  it("gives a child run its top-level run's folder, and ends it once, with the top-level run", async () => {
    const { executor, runs, scheduler, ports, folders } = writerRun({
      workflow: onboard,
      workflows: { reply: replyWorkflow },
    });

    await executor.start({ ...replyStart, workflowId: "onboard" });
    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({ status: "completed" });
    expect(await runs.get("run_1.2")).toMatchObject({ status: "completed" });
    expect(folders.opened.map(({ runId }) => runId)).toEqual(["run_1"]);
    expect(ports.sandbox.profiles.map((profile) => profile.workingFolder)).toEqual([
      "<data>/proposals/run_1/files/agents/writer",
    ]);
    expect(folders.ended).toEqual([{ runId: "run_1", stillOpen: 0 }]);
  });

  it("opens no folder for a run whose agents all run in Halonic's own loop", async () => {
    const ports = harnessPorts();
    const folders = new NotingFolders(ports.steps);
    const { executor } = runsOn([], new KernelRuns(), {
      agents: { writer: writerAgent() },
      harnesses: ports.options,
      proposalFolders: folders,
    });

    await executor.start(replyStart);

    expect(folders.opened).toEqual([]);
  });

  it("opens one when the start runs every task agent in a program harness", async () => {
    const ports = harnessPorts();
    const folders = new NotingFolders(ports.steps);
    const { executor } = runsOn([], new KernelRuns(), {
      agents: { writer: writerAgent() },
      harnesses: ports.options,
      proposalFolders: folders,
    });

    await executor.start({ ...replyStart, harness: "codex" });

    expect(folders.opened.map(({ runId }) => runId)).toEqual(["run_1"]);
  });

  it("stops the harness before it ends the folder of a cancelled run", async () => {
    const { executor, runs, scheduler, ports, folders } = writerRun();
    ports.harness.events = [];
    ports.harness.hangs = true;
    await executor.start(replyStart);
    const harnessCall = scheduler.deliver("run_1", "harness:call-1");
    await vi.waitFor(() => expect(ports.steps).toContain("harness.start"));

    await executor.cancel("run_1");
    await harnessCall;

    expect(await runs.get("run_1")).toMatchObject({ status: "failed", reason: "cancelled" });
    expect(folders.ended).toEqual([{ runId: "run_1", stillOpen: 0 }]);
  });

  it("records no run when the folder can't be opened", async () => {
    const { executor, runs, folders } = writerRun();
    folders.openError = new Error("The data folder is full.");

    await expect(executor.start(replyStart)).rejects.toThrow("The data folder is full.");

    expect(await runs.get("run_1")).toBeNull();
  });

  it("fails the run, and opens no sandbox, when its folder is gone", async () => {
    const { executor, runs, scheduler, ports, folders } = writerRun();
    await executor.start(replyStart);
    folders.forget("run_1");

    await scheduler.runDue();

    expect(await runs.get("run_1")).toMatchObject({ status: "failed" });
    expect((await runs.get("run_1"))?.error).toContain("no folder to write files in");
    expect(ports.steps).toEqual([]);
  });

  it("ends the folder of a run an engine finds interrupted when it next starts", async () => {
    const { executor, runs, scheduler, ports, folders } = writerRun();
    ports.harness.events = [];
    ports.harness.hangs = true;
    await executor.start(replyStart);
    const harnessCall = scheduler.deliver("run_1", "harness:call-1");
    await vi.waitFor(() => expect(ports.steps).toContain("harness.start"));
    await executor.close();
    await harnessCall;
    expect(folders.ended).toEqual([]);

    const next = runsOn([], runs, {
      agents: { writer: writerAgent("claude-code") },
      harnesses: harnessPorts().options,
      proposalFolders: folders,
    });
    await next.executor.start({ ...replyStart, runId: "run_2" });

    expect(await runs.get("run_1")).toMatchObject({ status: "failed", reason: "interrupted" });
    expect(folders.ended.map(({ runId }) => runId)).toEqual(["run_1"]);
  });
});
