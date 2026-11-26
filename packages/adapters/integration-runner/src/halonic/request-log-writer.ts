// Writes a local integration's requests and failed calls to the request log
// store in the profile (HAL-18391 plan, section 2.2), as they happen. Each
// request's path is masked against the integration's code as it is on disk
// then, so an entry keeps its mask when the code changes later.

import { readdir, readFile } from "node:fs/promises";
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

/** The most code text the masking reads; the folder check already caps the entries. */
const maxCodeLength = 4_000_000;

/** The request log of one local integration, written in the background. */
export class RequestLogWriter {
  readonly #log: LocalRequestLog;
  readonly #integration: string;
  readonly #folder: string;
  readonly #tools: ReadonlySet<string>;
  #last: Promise<void> = Promise.resolve();

  constructor(log: LocalRequestLog, integration: string, folder: string, tools: readonly string[]) {
    this.#log = log;
    this.#integration = integration;
    this.#folder = folder;
    this.#tools = new Set(tools);
  }

  /** Keeps one request, masked against the code as it is now. */
  request(entry: RequestLogEntry): Promise<void> {
    return this.#write(async () => {
      const code = await integrationCode(this.#folder);
      await this.#log.store.addRequest(this.#log.workspace, this.#integration, entry, code);
    });
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
    return this.#write(() =>
      this.#log.store.addFailure(this.#log.workspace, this.#integration, {
        tool,
        ...(failure?.kind === undefined ? {} : { kind: failure.kind }),
        ...(fields === undefined ? {} : { fields }),
      }),
    );
  }

  /**
   * Runs `write` after the earlier ones, so the log keeps the order things
   * happened in. The log only helps debugging: a write that fails, such as
   * on a full disk, never fails the call, and the next one tries again.
   */
  #write(write: () => Promise<void>): Promise<void> {
    this.#last = this.#last.then(write).catch(() => undefined);
    return this.#last;
  }
}

/**
 * The text of the integration's own code files, at any depth, leaving out
 * `node_modules` and hidden folders. The loader's link check has already
 * refused a folder with a link out of it, and a link isn't followed here.
 */
async function integrationCode(folder: string): Promise<string> {
  const texts: string[] = [];
  let length = 0;
  const look = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        await look(path);
      } else if (entry.isFile() && codeFile.test(entry.name) && length < maxCodeLength) {
        const text = await readFile(path, "utf8");
        length += text.length;
        texts.push(text);
      }
    }
  };
  await look(folder);
  return texts.join("\n");
}
