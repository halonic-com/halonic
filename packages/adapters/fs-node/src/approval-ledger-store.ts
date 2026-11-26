import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { dirname } from "node:path";
import type { LedgerEntry, LedgerStore } from "@halonicjs/auto-approvals";
import { makePrivateFolder, readUnlinkedFile } from "./private-files.ts";

// Append only, never through a link put in the file's place. Windows has no
// O_NOFOLLOW; `readUnlinkedFile` still refuses a link there before the first append.
const appendFlags =
  constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | (constants.O_NOFOLLOW ?? 0);

/**
 * The auto approvals shadow ledger as one JSONL file in the person's profile:
 * one entry per line, each line flushed to disk before `append` resolves.
 *
 * The store can only add lines. It has no way to change or remove an entry;
 * `verifyChain` finds any edit made to the file by other means. A line torn
 * by a crash was never acknowledged, so it is cut off on the first read and
 * the chain goes on from the last whole entry.
 */
export class FileApprovalLedgerStore implements LedgerStore {
  readonly #file: string;
  #loaded: Promise<LedgerEntry[]> | undefined;

  /** @param file - the ledger file; its folder is created only the person may open */
  constructor(file: string) {
    this.#file = file;
  }

  /** The newest entry, or `null` while the file is missing or empty. */
  async last(): Promise<LedgerEntry | null> {
    return (await this.#entries()).at(-1) ?? null;
  }

  /** Every entry, oldest first. */
  async entries(): Promise<readonly LedgerEntry[]> {
    return [...(await this.#entries())];
  }

  /** Adds the entry as the file's last line and flushes it to disk. */
  async append(entry: LedgerEntry): Promise<void> {
    const entries = await this.#entries();
    await makePrivateFolder(dirname(this.#file));
    const handle = await open(this.#file, appendFlags, 0o600);
    try {
      await handle.appendFile(`${JSON.stringify(entry)}\n`, "utf8");
      await handle.datasync();
    } finally {
      await handle.close();
    }
    entries.push(entry);
  }

  #entries(): Promise<LedgerEntry[]> {
    this.#loaded ??= this.#load();
    return this.#loaded;
  }

  async #load(): Promise<LedgerEntry[]> {
    const text = await this.#readText();
    const intactLength = text.lastIndexOf("\n") + 1;
    if (intactLength < text.length) {
      await this.#cutTornLine(Buffer.byteLength(text.slice(0, intactLength)));
    }
    const lines = text.slice(0, intactLength).split("\n").slice(0, -1);
    return lines.map((line, index) => this.#parse(line, index + 1));
  }

  async #readText(): Promise<string> {
    try {
      return await readUnlinkedFile(this.#file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    }
  }

  async #cutTornLine(intactBytes: number): Promise<void> {
    const handle = await open(this.#file, constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      await handle.truncate(intactBytes);
      await handle.datasync();
    } finally {
      await handle.close();
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
