// The folder a top-level run writes workspace files in, in place of the
// workspace: its proposal folder (requirement `engine.run-proposal-folder`).
// The engine decides which runs get one, opens it before the run starts,
// gives it to every harness call of the run and its child runs, and ends it
// once the run has ended and nothing of it runs any more. What the folder is,
// and what becomes of what the run changed in it, is the host's.

import type { RunVersion } from "@halonicjs/events";
import type { RunStore } from "@halonicjs/ports";
import { programHarnessOf } from "../kernel/agent-call.ts";
import type { RunDefinitions } from "../kernel/decide-types.ts";
import type { RunState } from "../kernel/run-state.ts";
import { readRun } from "../kernel/step.ts";
import { maxChildDepth } from "../states/workflow/state.ts";

/** The top-level run a proposal folder is opened for. */
export interface ProposalRun {
  readonly runId: string;
  readonly hubId: string;
  readonly workflowId: string;
  /**
   * The version of the workspace the run's definitions were read from, as
   * its start names it: the folder is made at this version. The engine
   * opens the folder before it records `run.started`, so the host can't
   * read it from the run's log yet. `null` when the start names none.
   */
  readonly version: RunVersion | null;
}

/**
 * The proposal folders of top-level runs. The host implements it with the
 * proposal service of `core/app` (`RunProposals`): a worktree of the
 * workspace at the version the run's definitions were read from, in
 * Halonic's data folder.
 */
export interface RunProposalFolders {
  /**
   * Opens the run's folder. Opening a run that is open gives its folder again.
   *
   * @returns the folder's absolute path
   * @throws when the folder can't be made; the run doesn't start
   */
  open(run: ProposalRun): Promise<string>;
  /**
   * The folder of a run that is open, also after the host started again.
   *
   * @returns `null` when the run has no open folder
   */
  folderOf(runId: string): Promise<string | null>;
  /**
   * Ends the run's folder: keeps what the run changed as its proposal and
   * removes the folder. The engine calls it once nothing of the run writes
   * any more, whether the run completed, failed or was cancelled, and for
   * a run with no open folder too, which changes nothing.
   *
   * It doesn't throw: the run has already ended, and its cancel or its
   * parent's step must go on. A folder it can't end, it reports, and the
   * host clears it at its next start.
   */
  end(runId: string): Promise<void>;
}

/**
 * Whether a run with these definitions can write workspace files: whether
 * any of its hub's agents runs in a program harness, which may write in its
 * working folder, with the run's own `harness` in place of the one each
 * file names. Halonic's own loop has no file tools, and no state writes a
 * file. It counts every agent of the hub, not only those the workflow
 * names, because a task agent can call any of them.
 *
 * @param harness - the harness the run's start names for all its task agents, if any
 *
 * @example
 * writesFiles({ workflow, agents: { writer: { ...writer, harness: "codex" } } }, undefined); // true
 * writesFiles({ workflow, agents: { writer } }, "halonic"); // false
 */
export function writesFiles(definitions: RunDefinitions, harness: string | undefined): boolean {
  const agents = definitions.agents ?? {};
  const run = { harness: harness ?? null };
  return Object.keys(agents).some((agentId) => programHarnessOf(run, agents, agentId) !== null);
}

/**
 * The top-level run a run belongs to: the run itself, or the run whose
 * `workflow` or `foreach` state started it, all the way up.
 *
 * @throws when a parent's log is missing, or the chain is deeper than a run can start
 */
export async function topLevelRunOf(
  runs: Pick<RunStore, "events" | "snapshot">,
  run: Pick<RunState, "runId" | "parent">,
): Promise<string> {
  let current = run;
  for (let depth = 0; depth <= maxChildDepth; depth += 1) {
    if (current.parent === null) return current.runId;
    const parent = await readRun(runs, current.parent.runId);
    if (parent === null) {
      throw new Error(
        `Run "${current.runId}" names parent "${current.parent.runId}", which has no log.`,
      );
    }
    current = parent;
  }
  throw new Error(`Run "${run.runId}" is more than ${maxChildDepth} child runs deep.`);
}

/**
 * The proposal folders of the local executor's runs, on the host's
 * {@link RunProposalFolders}. Without them, no run gets a folder, and every
 * harness agent works in the workspace as its profile says.
 */
export class RunsProposalFolders {
  readonly #runs: Pick<RunStore, "events" | "snapshot">;
  readonly #folders: RunProposalFolders | undefined;

  constructor(
    runs: Pick<RunStore, "events" | "snapshot">,
    folders: RunProposalFolders | undefined,
  ) {
    this.#runs = runs;
    this.#folders = folders;
  }

  /**
   * Opens the folder of a top-level run that can write files, before its
   * start is recorded, so its first step already finds it.
   *
   * @param harness - the harness the start names for all its task agents, if any
   * @returns whether a folder was opened, which {@link RunsProposalFolders.ended} then ends
   * @throws what the host's `open` throws
   */
  async open(
    run: ProposalRun,
    definitions: RunDefinitions,
    harness: string | undefined,
  ): Promise<boolean> {
    if (this.#folders === undefined || !writesFiles(definitions, harness)) return false;
    await this.#folders.open(run);
    return true;
  }

  /**
   * Ends the folder {@link RunsProposalFolders.open} opened for a start that
   * then wasn't recorded: the run never ran, so it changed nothing.
   */
  async notStarted(runId: string): Promise<void> {
    await this.#folders?.end(runId);
  }

  /**
   * The folder the run's harness agents write workspace files in: its
   * top-level run's. A child run, and a `foreach` item, share it.
   *
   * @returns `null` when the host has no proposal folders
   * @throws when the host has them but the top-level run has no open folder:
   *   the agent would otherwise write in the workspace
   */
  async folderOf(
    run: Pick<RunState, "runId" | "parent">,
    topLevelRunId: string,
  ): Promise<string | null> {
    if (this.#folders === undefined) return null;
    const folder = await this.#folders.folderOf(topLevelRunId);
    if (folder === null) {
      throw new Error(
        `Run "${run.runId}" has no folder to write files in, so its harness agent can't run: run "${topLevelRunId}" didn't get one when it started, or has ended.`,
      );
    }
    return folder;
  }

  /**
   * Ends the folder of a run that has just ended, when it is a top-level
   * run: first `stopCalls` stops every harness call still going on in the
   * run and its child runs, so nothing writes in the folder while the host
   * keeps what changed. A child run's end changes nothing.
   *
   * @param stopCalls - stops the harness calls under a top-level run, and resolves once they have stopped
   */
  async ended(runId: string, stopCalls: (topLevelRunId: string) => Promise<void>): Promise<void> {
    if (this.#folders === undefined) return;
    const run = await readRun(this.#runs, runId);
    if (run === null || run.parent !== null) return;
    await stopCalls(runId);
    await this.#folders.end(runId);
  }
}
