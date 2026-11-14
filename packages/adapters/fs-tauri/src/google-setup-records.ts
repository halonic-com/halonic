import { parseRecordLines, type RecordChange, type RecordStore } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { googleSetupCommands } from "./google-setup-commands.ts";
import { noAnswer, recordFailure } from "./record-store.ts";
import type { TauriShell } from "./shell.ts";

/**
 * The Google setup records for the Studio desktop app, read-only: the one
 * collection the CLI keeps in the profile's `google/setups` folder, read
 * through the shell's `google_setup_read` command. Pass it to `setupRecords`
 * in `@halonicjs/google-setup`, so the records are read with that package's
 * rules and there is no second parser. Its `list` and `read` work; a call
 * that would write is refused, since the sign-in and secret steps run in the
 * CLI and the host for now.
 */
export class TauriGoogleSetupRecords implements RecordStore {
  readonly #shell: TauriShell;
  readonly #collection: string;

  /**
   * @param shell - the shell's IPC, usually `window.__TAURI_INTERNALS__`
   * @param collection - the collection the setup records are in, `setupCollection` in `@halonicjs/google-setup`;
   *   the shell always answers `_google_setups`, whatever is passed, so any other name reads as no records
   */
  constructor(shell: TauriShell, collection: string) {
    this.#shell = shell;
    this.#collection = collection;
  }

  async append(_changes: readonly RecordChange[]): Promise<void> {
    throw readOnly();
  }

  async changes(collection: string): Promise<RecordChange[]> {
    if (collection !== this.#collection) {
      return [];
    }
    const { lines, file } = await this.#read();
    return parseRecordLines(lines, collection, file);
  }

  async compact(_collection: string): Promise<void> {
    throw readOnly();
  }

  async #read(): Promise<{ lines: string; file: string }> {
    let answer: unknown;
    try {
      answer = await this.#shell.invoke(googleSetupCommands.read, {});
    } catch (reason) {
      throw recordFailure(reason);
    }
    const { lines, file } = (answer ?? {}) as Record<string, unknown>;
    if (typeof lines !== "string" || typeof file !== "string") {
      throw noAnswer();
    }
    return { lines, file };
  }
}

function readOnly(): KindedError {
  return new KindedError(
    "denied",
    "The desktop app only reads the Google setup records; it can't change them yet.",
  );
}
