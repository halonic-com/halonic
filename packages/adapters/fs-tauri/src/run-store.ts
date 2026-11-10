import { type RunEvent, type RunSummary, summarize } from "@halonicjs/events";
import {
  type AppendOptions,
  type AppendResult,
  checkRunAppend,
  checkRunId,
  compareRunSummaries,
  formatLogLines,
  matchesRunFilter,
  parseLogLines,
  type RunFilter,
  type RunSnapshot,
  type RunStore,
} from "@halonicjs/ports";
import { checkDeploymentId } from "@halonicjs/profile";
import { type ErrorKind, KindedError } from "@halonicjs/std";
import { isRunRefusal, type RunRefusalKind, runCommands } from "./run-commands.ts";
import type { TauriShell } from "./shell.ts";

/** Where a {@link TauriRunStore} keeps its runs, and a hook for snapshots that couldn't be written. */
export interface TauriRunStoreOptions {
  /**
   * The deployment whose runs these are, kept in the workspace's
   * `deployments/<id>/runs`; left out for the workspace's own `runs`.
   */
  deployment?: string;
  /**
   * Called when an append stored its events but the shell couldn't write
   * the snapshot. The append still succeeds, since the snapshot is only a
   * cache, so this is the one place the failure shows; log it as a warning.
   * It must not throw, or the append rejects although its events are stored.
   */
  onSnapshotError?: (runId: string, error: unknown) => void;
}

/**
 * Runs for the Studio desktop app: every call goes to one of the shell's
 * `run_*` commands, which keep the runs in the profile's run folder for
 * the workspace, the same files the CLI's `FolderRunStore` reads and writes.
 * An append holds the run's lock file there, so of a CLI and the desktop
 * app appending with the same `expectedSeq`, exactly one wins.
 *
 * The page names the workspace, never a path, and the shell answers only
 * for a workspace the person opened in it. Everything that isn't file work
 * happens here, with the same rules as `fs-node` from the `RunStore` port:
 * checking an append, writing events as lines and reading them back, and
 * working out the list.
 */
export class TauriRunStore implements RunStore {
  readonly #shell: TauriShell;
  readonly #folder: { workspace: string; deployment: string | null };
  readonly #onSnapshotError: (runId: string, error: unknown) => void;

  /**
   * @param shell - the shell's IPC, usually `window.__TAURI_INTERNALS__`
   * @param workspace - the workspace folder, as the person opened it in the shell
   * @param options - the deployment, and a hook for snapshots that couldn't be written
   * @throws RangeError when the deployment isn't a deployment id, since it becomes a folder name
   */
  constructor(shell: TauriShell, workspace: string, options: TauriRunStoreOptions = {}) {
    if (options.deployment !== undefined) {
      checkDeploymentId(options.deployment);
    }
    this.#shell = shell;
    this.#folder = { workspace, deployment: options.deployment ?? null };
    this.#onSnapshotError = options.onSnapshotError ?? (() => {});
  }

  async append(
    runId: string,
    expectedSeq: number,
    events: readonly RunEvent[],
    options: AppendOptions = {},
  ): Promise<AppendResult> {
    checkRunId(runId);
    checkRunAppend(runId, expectedSeq, events);
    const lastSeq = expectedSeq + events.length;
    // Written to text first, so data JSON can't hold fails before anything is sent.
    const lines = formatLogLines(events);
    const snapshot =
      options.snapshot === undefined
        ? null
        : JSON.stringify({ seq: lastSeq, state: options.snapshot } satisfies RunSnapshot);
    const answer = await this.#call(runCommands.append, { runId, expectedSeq, lines, snapshot });
    const result = checkedAppend(answer);
    if (result.snapshotError !== undefined) {
      this.#onSnapshotError(runId, new Error(result.snapshotError));
    }
    return result.outcome;
  }

  async events(runId: string, afterSeq = 0): Promise<RunEvent[]> {
    checkRunId(runId);
    const lines = await this.#call(runCommands.events, { runId });
    if (typeof lines !== "string") {
      throw noAnswer();
    }
    return readLog(runId, lines).filter((event) => event.seq > afterSeq);
  }

  /**
   * The cached state, or `null` when there is none or it can't be used: a
   * file that isn't a snapshot, or ahead of the log because the log was cut
   * back or deleted. The engine then replays the log.
   */
  async snapshot(runId: string): Promise<RunSnapshot | null> {
    checkRunId(runId);
    const answer = await this.#call(runCommands.snapshot, { runId });
    if (answer === null) {
      return null;
    }
    const { text, logEvents } = checkedStoredSnapshot(answer);
    const snapshot = parseSnapshot(text);
    if (snapshot === null || snapshot.seq > logEvents) {
      return null;
    }
    return snapshot;
  }

  async get(runId: string): Promise<RunSummary | null> {
    return summarize(await this.events(runId));
  }

  async list(filter: RunFilter = {}): Promise<RunSummary[]> {
    const logs = await this.#call(runCommands.logs, {});
    if (!Array.isArray(logs)) {
      throw noAnswer();
    }
    const summaries: RunSummary[] = [];
    for (const log of logs) {
      const { runId, lines } = checkedLog(log);
      const summary = summarize(readLog(runId, lines));
      if (summary !== null && matchesRunFilter(summary, filter)) {
        summaries.push(summary);
      }
    }
    return summaries.sort(compareRunSummaries);
  }

  /** Runs one command on this store's run folder, turning a refusal into an error. */
  async #call(command: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.#shell.invoke(command, { ...this.#folder, ...args });
    } catch (reason) {
      throw runFailure(reason);
    }
  }
}

/** How a surface should respond to each refusal other than `broken_log`. */
const errorKinds: Readonly<Record<Exclude<RunRefusalKind, "broken_log">, ErrorKind>> = {
  folder_not_open: "denied",
  // The page checked the ids and wrote the lines, so a refusal is our bug.
  invalid_deployment: "internal",
  invalid_run_id: "internal",
  invalid_lines: "internal",
  io: "unavailable",
};

/**
 * The error a rejected `run_*` command becomes. A broken log is a plain
 * `Error` with the shell's message, which names the log, as `FolderRunStore`
 * throws it. Anything that isn't the shell's refusal shape (a missing
 * capability, a broken IPC call) is `unavailable`, and its text is dropped:
 * the adapter can't vouch for it.
 */
function runFailure(reason: unknown): Error {
  if (!isRunRefusal(reason)) {
    return noAnswer();
  }
  if (reason.kind === "broken_log") {
    return new Error(reason.message, { cause: reason });
  }
  return new KindedError(
    errorKinds[reason.kind],
    `The run store refused the call: ${reason.message}`,
  );
}

function noAnswer(): KindedError {
  return new KindedError("unavailable", "The desktop shell gave no answer to the run call.");
}

function readLog(runId: string, lines: string): RunEvent[] {
  return parseLogLines(lines, runId, `${runId}.jsonl`);
}

/** The shell's answer to an append, checked as far as the adapter relies on it. */
function checkedAppend(answer: unknown): { outcome: AppendResult; snapshotError?: string } {
  const { ok, reason, lastSeq, snapshotError } = (answer ?? {}) as Record<string, unknown>;
  if (typeof lastSeq !== "number" || !Number.isSafeInteger(lastSeq)) {
    throw noAnswer();
  }
  if (ok === false && reason === "conflict") {
    return { outcome: { ok: false, reason: "conflict", lastSeq } };
  }
  if (ok !== true || (snapshotError !== undefined && typeof snapshotError !== "string")) {
    throw noAnswer();
  }
  return {
    outcome: { ok: true, lastSeq },
    ...(snapshotError === undefined ? {} : { snapshotError }),
  };
}

function checkedStoredSnapshot(answer: unknown): { text: string; logEvents: number } {
  const { text, logEvents } = (answer ?? {}) as Record<string, unknown>;
  if (typeof text !== "string" || typeof logEvents !== "number") {
    throw noAnswer();
  }
  return { text, logEvents };
}

function checkedLog(answer: unknown): { runId: string; lines: string } {
  const { runId, lines } = (answer ?? {}) as Record<string, unknown>;
  if (typeof runId !== "string" || typeof lines !== "string") {
    throw noAnswer();
  }
  return { runId, lines };
}

/** A stored snapshot, or `null` when the text isn't one, read as `FolderRunStore` reads it. */
function parseSnapshot(text: string): RunSnapshot | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const { seq, state } = (parsed ?? {}) as Partial<RunSnapshot>;
  if (!Number.isSafeInteger(seq) || (seq as number) < 1 || state === undefined) {
    return null;
  }
  return { seq: seq as number, state };
}
