// Writes a local integration's requests and failed calls to the request log
// store in the profile (HAL-18391 plan, section 2.2), as they happen. Each
// request's path is masked against the integration's code as it is on disk
// then, so an entry keeps its mask when the code changes later. The store
// batches the writes and reads the code once per write, and each code file's
// size is checked before it is read (Julian, HAL-19170).

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

/** The biggest code file the masking reads; a bigger one is skipped. */
const maxFileBytes = 1_000_000;
/** The most code the masking reads in all; a file past it is skipped. */
const maxCodeBytes = 4_000_000;
/**
 * A code file is opened without following a link where the system can tell,
 * and without waiting on a named pipe put in its place.
 */
const openFlags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

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
    return this.#kept(
      this.#log.store.addRequest(this.#log.workspace, this.#integration, entry, () =>
        integrationCode(this.#folder),
      ),
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
    return this.#kept(
      this.#log.store.addFailure(this.#log.workspace, this.#integration, {
        tool,
        ...(failure?.kind === undefined ? {} : { kind: failure.kind }),
        ...(fields === undefined ? {} : { fields }),
      }),
    );
  }

  /**
   * The store keeps lines in the order they were added. The log only helps
   * debugging: a write that fails, such as on a full disk, never fails the
   * call, and the next one tries again.
   */
  #kept(added: Promise<void>): Promise<void> {
    return added.catch(() => undefined);
  }
}

/**
 * The text of the integration's own code files, at any depth, leaving out
 * `node_modules` and hidden folders. The loader's link check has already
 * refused a folder with a link out of it, and a link isn't followed here.
 * A file over 1 MB, or past 4 MB in all, is skipped: less code only masks
 * more.
 */
async function integrationCode(folder: string): Promise<string> {
  const texts: string[] = [];
  let bytes = 0;
  for (const path of await codeFiles(folder)) {
    const text = await codeText(path, maxCodeBytes - bytes);
    if (text === undefined) continue;
    bytes += text.bytes;
    texts.push(text.text);
  }
  return texts.join("\n");
}

/** The paths of the code files in `folder`, at any depth, in the order they are listed. */
async function codeFiles(folder: string): Promise<string[]> {
  const paths: string[] = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await codeFiles(path)));
    } else if (entry.isFile() && codeFile.test(entry.name)) {
      paths.push(path);
    }
  }
  return paths;
}

/**
 * The file's text, read through one open handle after its size is checked
 * there, or `undefined` when it isn't a plain file, or is over 1 MB or over
 * the `room` left. Only that many bytes are read, even if the file grows.
 */
async function codeText(
  path: string,
  room: number,
): Promise<{ text: string; bytes: number } | undefined> {
  const handle = await open(path, openFlags);
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size > maxFileBytes || stats.size > room) return undefined;
    const buffer = Buffer.alloc(stats.size);
    const { bytesRead } = await handle.read(buffer, 0, stats.size, 0);
    return { text: buffer.toString("utf8", 0, bytesRead), bytes: bytesRead };
  } finally {
    await handle.close();
  }
}
