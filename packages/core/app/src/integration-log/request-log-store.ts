// The local request log of each integration, kept in the profile so the
// integration debugger can read it after a restart (HAL-18391 plan, section
// 2.2). It lives outside every workspace, so "Offer to Halonic" can't include
// it and a workspace file can't plant entries in it. It holds no query, no
// headers and no bodies, as the kit's log doesn't, and paths are masked when
// an entry is written, never when it is read (Liam, HAL-18391).

import { maskedPath, maskedSegment } from "./masked-path.ts";

/** One request an integration made, as the kit's request log has it. */
export interface LoggedRequest {
  readonly method: string;
  readonly host: string;
  readonly path: string;
  readonly status?: number;
  readonly durationMs: number;
  readonly outcome: "ok" | "refused" | "failed";
  readonly refusal?: string;
}

/** A tool call that failed: the tool, the kind of error and the fields a changed reply named. */
export interface FailedCall {
  readonly tool: string;
  readonly kind?: string;
  /** The schema fields of a `reply-changed` failure, such as `fulfillment.status`. */
  readonly fields?: readonly string[];
}

/** One line of the log file, oldest first. */
export type RequestLogLine =
  | ({ readonly type: "request"; readonly at: string } & LoggedRequest)
  | ({ readonly type: "failure"; readonly at: string } & FailedCall);

/**
 * The files the store keeps, under `integration-logs/` in the profile: one
 * folder per workspace key, one file per integration. A file is replaced
 * whole, only the person may read it (`0600`), and a link in its place is
 * refused. `fs-node`'s `requestLogFilesIn` is the one on disk.
 */
export interface RequestLogFiles {
  read(workspace: string, file: string): Promise<string | undefined>;
  write(workspace: string, file: string, text: string): Promise<void>;
  remove(workspace: string, file: string): Promise<void>;
  removeWorkspace(workspace: string): Promise<void>;
}

/** A workspace key, as `workspaceFolders` makes it. */
const workspaceKeyPattern = /^[0-9a-f]{32}$/;
/** An integration id that can name a file on every platform. */
const integrationIdPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;
/** A field name keeps only path characters; anything else could be reply text. */
const fieldPattern = /^[A-Za-z0-9_.[\]-]{1,100}$/;

/** The store of every integration's local request log. */
export class RequestLogStore {
  readonly #files: RequestLogFiles;
  readonly #limit: number;
  /** The write running for each file, so two writes never interleave. */
  readonly #writes = new Map<string, Promise<void>>();
  readonly #now: () => Date;

  /** @param limit - how many requests, and how many failure notes, each file keeps */
  constructor(files: RequestLogFiles, options: { limit?: number; now?: () => Date } = {}) {
    this.#files = files;
    this.#limit = options.limit ?? 200;
    this.#now = options.now ?? (() => new Date());
  }

  /**
   * Adds a request, with every path segment `code` doesn't hold masked.
   *
   * @param code - the integration's code as it is now
   * @throws RangeError when the workspace key or integration id can't name a file
   */
  async addRequest(
    workspace: string,
    integration: string,
    request: LoggedRequest,
    code: string,
  ): Promise<void> {
    const { method, host, path, status, durationMs, outcome, refusal } = request;
    await this.#add(workspace, integration, {
      type: "request",
      at: this.#now().toISOString(),
      method,
      host,
      path: maskedPath(path, code),
      ...(status === undefined ? {} : { status }),
      durationMs,
      outcome,
      ...(refusal === undefined ? {} : { refusal }),
    });
  }

  /** Adds the note of a failed call. A field name that isn't a plain path is stored as `{…}`. */
  async addFailure(workspace: string, integration: string, failure: FailedCall): Promise<void> {
    const { tool, kind, fields } = failure;
    await this.#add(workspace, integration, {
      type: "failure",
      at: this.#now().toISOString(),
      tool,
      ...(kind === undefined ? {} : { kind }),
      ...(fields === undefined
        ? {}
        : { fields: fields.map((field) => (fieldPattern.test(field) ? field : maskedSegment)) }),
    });
  }

  /** The integration's log, oldest first. */
  async lines(workspace: string, integration: string): Promise<RequestLogLine[]> {
    await this.#writes.get(fileKey(workspace, integration))?.catch(() => undefined);
    return parseLines(await this.#files.read(workspace, fileName(workspace, integration)));
  }

  /** Deletes the integration's log, as when the integration is removed. */
  async removeIntegration(workspace: string, integration: string): Promise<void> {
    await this.#queue(workspace, integration, () =>
      this.#files.remove(workspace, fileName(workspace, integration)),
    );
  }

  /** Deletes the logs of every integration in the workspace, as when the workspace is forgotten. */
  async forgetWorkspace(workspace: string): Promise<void> {
    checkWorkspace(workspace);
    await Promise.allSettled(this.#writes.values());
    await this.#files.removeWorkspace(workspace);
  }

  async #add(workspace: string, integration: string, line: RequestLogLine): Promise<void> {
    const file = fileName(workspace, integration);
    await this.#queue(workspace, integration, async () => {
      const lines = [...parseLines(await this.#files.read(workspace, file)), line];
      const kept = new Set([
        ...lastOf(lines, "request", this.#limit),
        ...lastOf(lines, "failure", this.#limit),
      ]);
      const text = lines
        .filter((each) => kept.has(each))
        .map((each) => `${JSON.stringify(each)}\n`)
        .join("");
      await this.#files.write(workspace, file, text);
    });
  }

  /** Runs `write` after the file's earlier writes; a failed write doesn't stop the next one. */
  async #queue(workspace: string, integration: string, write: () => Promise<void>): Promise<void> {
    const key = fileKey(workspace, integration);
    const next = (this.#writes.get(key) ?? Promise.resolve()).catch(() => undefined).then(write);
    this.#writes.set(key, next);
    try {
      await next;
    } finally {
      if (this.#writes.get(key) === next) this.#writes.delete(key);
    }
  }
}

function lastOf(lines: readonly RequestLogLine[], type: RequestLogLine["type"], limit: number) {
  return lines.filter((line) => line.type === type).slice(-limit);
}

/** The file's lines; a line that isn't a log line, such as one torn by a crash, is left out. */
function parseLines(text: string | undefined): RequestLogLine[] {
  return (text ?? "").split("\n").flatMap((line) => {
    try {
      const parsed: unknown = JSON.parse(line);
      const type = (parsed as { type?: unknown } | null)?.type;
      return type === "request" || type === "failure" ? [parsed as RequestLogLine] : [];
    } catch {
      return [];
    }
  });
}

function fileName(workspace: string, integration: string): string {
  checkWorkspace(workspace);
  if (!integrationIdPattern.test(integration)) {
    throw new RangeError(`Not an integration id: ${JSON.stringify(integration)}.`);
  }
  return `${integration}.jsonl`;
}

function fileKey(workspace: string, integration: string): string {
  return `${workspace}/${integration}`;
}

function checkWorkspace(workspace: string): void {
  if (!workspaceKeyPattern.test(workspace)) {
    throw new RangeError(`Not a workspace key: ${JSON.stringify(workspace)}.`);
  }
}
