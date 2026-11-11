import {
  compactedChanges,
  formatRecordLines,
  parseRecordLines,
  type RecordChange,
  type RecordStore,
} from "@halonicjs/ports";
import { type ErrorKind, KindedError } from "@halonicjs/std";
import { isRecordRefusal, type RecordRefusalKind, recordCommands } from "./record-commands.ts";
import type { TauriShell } from "./shell.ts";

/**
 * How often a compact reads and folds again when changes keep arriving
 * between its read and its replace, before it gives up with `conflict`.
 */
const compactTries = 5;

/** A collection's log as the shell read it. */
interface StoredLog {
  lines: string;
  version: string;
  file: string;
}

/**
 * Records for the Studio desktop app: every call goes to one of the shell's
 * `record_*` commands, which keep the collections in the profile's record
 * folder for the workspace, the same logs the CLI's `FileRecordStore` reads
 * and writes, under the same write lock. So a collection changed on desktop
 * is there for `halonic serve`, and the other way round.
 *
 * The page names the workspace and the collection, never a path. Everything
 * that isn't file work happens here, with the `RecordStore` port's rules
 * that `fs-node` uses too: writing changes as lines and reading them back,
 * and folding a collection for a compact. A compact reads the log with its
 * version, folds it, and has the shell replace the log only while it still
 * has that version, so a change appended in between is never lost: the
 * compact reads and folds again.
 */
export class TauriRecordStore implements RecordStore {
  readonly #shell: TauriShell;
  readonly #workspace: string;

  /**
   * @param shell - the shell's IPC, usually `window.__TAURI_INTERNALS__`
   * @param workspace - the workspace folder, as the person opened it in the shell
   */
  constructor(shell: TauriShell, workspace: string) {
    this.#shell = shell;
    this.#workspace = workspace;
  }

  async append(changes: readonly RecordChange[]): Promise<void> {
    if (changes.length === 0) {
      return;
    }
    // Written to text first, so a change JSON can't hold fails before anything is sent.
    const appends = [...linesPerCollection(changes)].map(([collection, lines]) => ({
      collection,
      lines,
    }));
    await this.#call(recordCommands.append, { appends });
  }

  async changes(collection: string): Promise<RecordChange[]> {
    const log = await this.#read(collection);
    return parseRecordLines(log.lines, collection, log.file);
  }

  async compact(collection: string): Promise<void> {
    for (let attempt = 0; attempt < compactTries; attempt += 1) {
      const log = await this.#read(collection);
      if (log.lines === "") {
        return;
      }
      const seeds = compactedChanges(collection, parseRecordLines(log.lines, collection, log.file));
      const answer = await this.#call(recordCommands.replace, {
        collection,
        version: log.version,
        lines: formatRecordLines(seeds),
      });
      const status = (answer as { status?: unknown } | null)?.status;
      if (status === "replaced") {
        return;
      }
      if (status !== "changed") {
        throw noAnswer();
      }
    }
    throw new KindedError(
      "conflict",
      `Collection ${JSON.stringify(collection)} kept changing while it was compacted; try again.`,
    );
  }

  async #read(collection: string): Promise<StoredLog> {
    const answer = await this.#call(recordCommands.read, { collection });
    const { lines, version, file } = (answer ?? {}) as Record<string, unknown>;
    if (typeof lines !== "string" || typeof version !== "string" || typeof file !== "string") {
      throw noAnswer();
    }
    return { lines, version, file };
  }

  /** Runs one command on this store's record folder, turning a refusal into an error. */
  async #call(command: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.#shell.invoke(command, { workspace: this.#workspace, ...args });
    } catch (reason) {
      throw recordFailure(reason);
    }
  }
}

/** The changes as log lines, by collection, in the order they came. */
function linesPerCollection(changes: readonly RecordChange[]): Map<string, string> {
  const lines = new Map<string, string>();
  for (const change of changes) {
    lines.set(
      change.collection,
      (lines.get(change.collection) ?? "") + formatRecordLines([change]),
    );
  }
  return lines;
}

/** How a surface should respond to each refusal that isn't about the log file itself. */
const errorKinds: Readonly<
  Record<Exclude<RecordRefusalKind, "broken_log" | "linked_log">, ErrorKind>
> = {
  folder_not_open: "denied",
  // The page wrote the lines, so a refusal is our bug.
  invalid_lines: "internal",
  io: "unavailable",
};

/**
 * The error a rejected `record_*` command becomes. A broken or linked log
 * is a plain `Error` with the shell's message, which names the log, as
 * `FileRecordStore` throws for one. Anything that isn't the shell's refusal
 * shape (a missing capability, a broken IPC call) is `unavailable`, and its
 * text is dropped: the adapter can't vouch for it.
 */
function recordFailure(reason: unknown): Error {
  if (!isRecordRefusal(reason)) {
    return noAnswer();
  }
  if (reason.kind === "broken_log" || reason.kind === "linked_log") {
    return new Error(reason.message, { cause: reason });
  }
  return new KindedError(
    errorKinds[reason.kind],
    `The record store refused the call: ${reason.message}`,
  );
}

function noAnswer(): KindedError {
  return new KindedError("unavailable", "The desktop shell gave no answer to the record call.");
}
