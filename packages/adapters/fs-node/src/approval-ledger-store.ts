import { dirname } from "node:path";
import type { LedgerEntry, LedgerStore } from "@halonicjs/auto-approvals";
import { isMissing } from "./links.ts";
import { cutBack, intactEnd, writeAll } from "./log-file.ts";
import { makePrivateFolder, openUnlinkedForAppend, readUnlinkedBytes } from "./private-files.ts";

const lineBreak = 0x0a;

/**
 * The auto approvals shadow ledger as one JSONL file in the person's profile:
 * one entry per line, each line flushed to disk before `append` resolves.
 *
 * The store can only add lines. It has no way to change or remove an entry;
 * `verifyChain` finds an edit to an entry made by other means, unless every
 * later entry was rehashed too. Like the record store, it never reads or
 * writes through a symbolic link, a hard link or anything but a plain file
 * in the file's place.
 *
 * It assumes it is the only writer of its file, in this process and any
 * other: it takes no lock, and the `Ledger` above it appends one entry at a
 * time.
 *
 * A line torn by a crash was never acknowledged. Reads skip it and leave the
 * file alone; the next `append` cuts it off, so the chain goes on from the
 * last whole entry. A failed append is cut back the same way, so it stores
 * nothing.
 */
export class FileApprovalLedgerStore implements LedgerStore {
  readonly #file: string;

  /** @param file - the ledger file; its folder is created only the person may open */
  constructor(file: string) {
    this.#file = file;
  }

  /** The newest entry, or `null` while the file is missing or empty. */
  async last(): Promise<LedgerEntry | null> {
    return (await this.entries()).at(-1) ?? null;
  }

  /** Every whole entry in the file, oldest first. */
  async entries(): Promise<readonly LedgerEntry[]> {
    const bytes = await this.#readBytes();
    const intactBytes = bytes.lastIndexOf(lineBreak) + 1;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, intactBytes));
    const lines = text.split("\n").slice(0, -1);
    return lines.map((line, index) => this.#parse(line, index + 1));
  }

  /** Adds the entry as the file's last line and flushes it to disk. */
  async append(entry: LedgerEntry): Promise<void> {
    const line = new TextEncoder().encode(`${JSON.stringify(entry)}\n`);
    await makePrivateFolder(dirname(this.#file));
    const handle = await openUnlinkedForAppend(this.#file);
    let intactBytes: number | undefined;
    try {
      const { size } = await handle.stat();
      intactBytes = await intactEnd(handle, size);
      if (intactBytes < size) {
        await cutBack(this.#file, intactBytes);
      }
      await writeAll(handle, this.#file, line);
      await handle.datasync();
    } catch (error) {
      await this.#cutBackAfterFailure(intactBytes);
      throw error;
    } finally {
      await handle.close();
    }
  }

  /**
   * Cuts the file back to its whole entries after a failed append, so no
   * half-written line is left and a later append doesn't reuse the index.
   * When the cut fails too, the append's own error is the one worth
   * reporting; a torn line left behind is cut by the next append.
   */
  async #cutBackAfterFailure(intactBytes: number | undefined): Promise<void> {
    if (intactBytes === undefined) return;
    try {
      await cutBack(this.#file, intactBytes);
    } catch {
      // Left as it is; see above.
    }
  }

  async #readBytes(): Promise<Uint8Array> {
    try {
      return await readUnlinkedBytes(this.#file);
    } catch (error) {
      if (isMissing(error)) return new Uint8Array();
      throw error;
    }
  }

  #parse(line: string, lineNumber: number): LedgerEntry {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw this.#broken(`line ${lineNumber} is not JSON`);
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw this.#broken(`line ${lineNumber} is not an entry`);
    }
    // The fields are checked by `verifyChain`, which every reader runs.
    return value as LedgerEntry;
  }

  #broken(why: string): Error {
    return new Error(`Can't read the approval ledger ${this.#file}: ${why}.`);
  }
}
