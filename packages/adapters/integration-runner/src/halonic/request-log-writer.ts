// Writes a local integration's requests and failed calls to the request log
// store in the profile (HAL-18391 plan, section 2.2), as they happen. Each
// request's path is masked against the integration's code as it is on disk
// when the store writes it, so an entry keeps its mask when the code changes
// later. The store batches the writes and bounds what waits (Julian, HAL-19169).

import { constants } from "node:fs";
import { open, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { RequestLogEntry } from "@halonicjs/adapter-integration-kit";
import type { RequestLogStore } from "@halonicjs/app";
import { RunnerToolError } from "./limits.ts";

/** Where a local integration's request log is kept. */
export interface LocalRequestLog {
  readonly store: RequestLogStore;
  /** The key of the workspace the integration is in, from `workspaceFolders`. */
  readonly workspace: string;
}

/** The code files the masking reads: what the runner can run, not its packages. */
const codeFile = /\.(?:[cm]?js|[cm]?ts)$/;

/** The most code the masking reads, in bytes; the folder check already caps the entries. */
const maxCodeBytes = 4_000_000;
/** A bigger code file is skipped, not read: less code only masks more. */
const maxFileBytes = 1_000_000;

/** The request log of one local integration, written in the background. */
export class RequestLogWriter {
  readonly #log: LocalRequestLog;
  readonly #integration: string;
  readonly #folder: string;
  readonly #tools: ReadonlySet<string>;

  constructor(log: LocalRequestLog, integration: string, folder: string, tools: readonly string[]) {
    this.#log = log;
    this.#integration = integration;
    this.#folder = folder;
    this.#tools = new Set(tools);
  }

  /** Keeps one request, masked against the code as it is when the store writes it. */
  request(entry: RequestLogEntry): Promise<void> {
    const code = () => integrationCode(this.#folder);
    return this.#write(
      this.#log.store.addRequest(this.#log.workspace, this.#integration, entry, code),
    );
  }

  /** Keeps the note of a failed call to one of the sheet's tools: its error kind and the fields of a changed reply. */
  failure(tool: string, error: unknown): Promise<void> {
    if (!this.#tools.has(tool)) return Promise.resolve();
    const failure = error instanceof RunnerToolError ? error : undefined;
    const cause = failure?.failureCause;
    const fields =
      cause?.code === "reply-changed"
        ? Object.entries(cause.detail ?? {})
            .filter(([key]) => key.startsWith("field."))
            .map(([, field]) => field)
        : undefined;
    return this.#write(
      this.#log.store.addFailure(this.#log.workspace, this.#integration, {
        tool,
        ...(failure?.kind === undefined ? {} : { kind: failure.kind }),
        ...(fields === undefined ? {} : { fields }),
      }),
    );
  }

  /**
   * The store keeps the order things happened in. The log only helps
   * debugging: a write that fails, such as on a full disk, never fails the
   * call, and the next one tries again.
   */
  #write(written: Promise<void>): Promise<void> {
    return written.catch(() => undefined);
  }
}

/**
 * The text of the integration's own code files, at any depth, leaving out
 * `node_modules` and hidden folders. The loader's link check has already
 * refused a folder with a link out of it, and a link isn't followed here.
 * Each file's size is checked on the open file before it is read: one past
 * `maxFileBytes`, or past what is left of `maxCodeBytes`, is skipped. So is
 * one that can't be read, such as one an editor's save deleted or replaced
 * since it was listed: less code only masks more.
 */
async function integrationCode(folder: string): Promise<string> {
  const texts: string[] = [];
  let bytes = 0;
  const look = async (current: string): Promise<void> => {
    // A folder deleted since it was listed is skipped, as an unreadable file is.
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        await look(path);
      } else if (entry.isFile() && codeFile.test(entry.name)) {
        await keep(path);
      }
    }
  };
  const keep = async (path: string): Promise<void> => {
    const text = await readUpTo(path, Math.min(maxFileBytes, maxCodeBytes - bytes)).catch(
      () => undefined,
    );
    if (text === undefined) return;
    bytes += text.bytes;
    texts.push(text.text);
  };
  await look(folder);
  return texts.join("\n");
}

/** Where the system has them, `O_NOFOLLOW` refuses a link and `O_NONBLOCK` a pipe that never ends. */
const openFlags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

/** The file's text when it has at most `room` bytes, reading no more than that; else `undefined`. */
async function readUpTo(path: string, room: number) {
  const file = await open(path, openFlags);
  try {
    const { size } = await file.stat();
    if (size > room) return undefined;
    const buffer = Buffer.alloc(size);
    const { bytesRead } = await file.read(buffer, 0, size, 0);
    return { text: buffer.subarray(0, bytesRead).toString("utf8"), bytes: bytesRead };
  } finally {
    await file.close();
  }
}
