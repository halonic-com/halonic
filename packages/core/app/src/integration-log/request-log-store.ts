// The local request log of each integration, kept in the profile so the
// integration debugger can read it after a restart (HAL-18391 plan, section
// 2.2). It lives outside every workspace, so "Offer to Halonic" can't include
// it and a workspace file can't plant entries in it. It holds no query, no
// headers and no bodies, as the kit's log doesn't, and paths are masked when
// an entry is written, never when it is read (Liam, HAL-18391).

import { codeIndex, maskedPath, maskedSegment } from "./masked-path.ts";

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
/** An HTTP method token, such as `GET`; the bridge passes on any 32 characters. */
const methodPattern = /^[A-Z][A-Z-]{0,15}$/;
/**
 * A plain host name or a bracketed IP address, with an optional port. A
 * refused request's host comes from the integration's own URL, which can
 * hold an opaque host of any text (Julian, HAL-19169).
 */
const hostPattern = /^(?:[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*|\[[0-9A-Fa-f:.]+\])(?::[0-9]{1,5})?$/;
const maxHostLength = 260;

/** Reads the integration's code as it is now, for masking the paths of a write. */
export type CodeReader = () => Promise<string>;

/**
 * The store of every integration's local request log. Make one per profile:
 * it keeps the lines waiting for each file, and a remove or a forget drops them.
 *
 * Lines wait while the file's previous write runs, then go in one write: one
 * code read and one file write for all of them. At most `limit` of each type
 * wait, the oldest dropped first, so an integration that makes requests in a
 * tight loop can't grow the queue (Julian, HAL-19169).
 */
export class RequestLogStore {
  readonly #files: RequestLogFiles;
  readonly #limit: number;
  /** The write running for each file, so two writes never interleave. */
  readonly #writes = new Map<string, Promise<void>>();
  /** The lines waiting for each file's next write. */
  readonly #pending = new Map<string, PendingLines>();
  /** The workspaces being forgotten: a line added for one meanwhile is dropped. */
  readonly #forgetting = new Set<string>();
  readonly #now: () => Date;

  /** @param limit - how many requests, and how many failure notes, each file keeps and each write takes */
  constructor(files: RequestLogFiles, options: { limit?: number; now?: () => Date } = {}) {
    this.#files = files;
    this.#limit = options.limit ?? 200;
    this.#now = options.now ?? (() => new Date());
  }

  /**
   * Adds a request, with every path segment the code doesn't hold masked
   * when it is written. A method or host that isn't in its plain shape is
   * stored as `{…}`; an empty host stays empty.
   *
   * @param code - the integration's code, or how to read it as it is when the line is written
   * @throws RangeError when the workspace key or integration id can't name a file
   */
  async addRequest(
    workspace: string,
    integration: string,
    request: LoggedRequest,
    code: string | CodeReader,
  ): Promise<void> {
    const { method, host, path, status, durationMs, outcome, refusal } = request;
    const line: RequestLogLine = {
      type: "request",
      at: this.#now().toISOString(),
      method: methodPattern.test(method) ? method : maskedSegment,
      host: host === "" || isPlainHost(host) ? host : maskedSegment,
      path,
      ...(status === undefined ? {} : { status }),
      durationMs,
      outcome,
      ...(refusal === undefined ? {} : { refusal }),
    };
    const readCode = typeof code === "string" ? async () => code : code;
    return this.#add(workspace, integration, line, readCode);
  }

  /** Adds the note of a failed call. A field name that isn't a plain path is stored as `{…}`. */
  async addFailure(workspace: string, integration: string, failure: FailedCall): Promise<void> {
    const { tool, kind, fields } = failure;
    return this.#add(workspace, integration, {
      type: "failure",
      at: this.#now().toISOString(),
      tool,
      ...(kind === undefined ? {} : { kind }),
      ...(fields === undefined
        ? {}
        : { fields: fields.map((field) => (fieldPattern.test(field) ? field : maskedSegment)) }),
    });
  }

  /** How many lines wait for the integration's next write. */
  pendingCount(workspace: string, integration: string): number {
    return this.#pending.get(fileKey(workspace, integration))?.lines.length ?? 0;
  }

  /** The integration's log, oldest first. */
  async lines(workspace: string, integration: string): Promise<RequestLogLine[]> {
    await this.#writes.get(fileKey(workspace, integration))?.catch(() => undefined);
    return parseLines(await this.#files.read(workspace, fileName(workspace, integration)));
  }

  /** Drops the integration's waiting lines and deletes its log, as when the integration is removed. */
  async removeIntegration(workspace: string, integration: string): Promise<void> {
    const file = fileName(workspace, integration);
    this.#pending.delete(fileKey(workspace, integration));
    await this.#queue(workspace, integration, () => this.#files.remove(workspace, file));
  }

  /**
   * Drops the waiting lines of every integration in the workspace and deletes
   * its logs, as when the workspace is forgotten. A write already running
   * finishes first, so no file comes back after the folder is gone.
   */
  async forgetWorkspace(workspace: string): Promise<void> {
    checkWorkspace(workspace);
    this.#forgetting.add(workspace);
    try {
      for (const key of this.#pending.keys()) {
        if (key.startsWith(`${workspace}/`)) this.#pending.delete(key);
      }
      await Promise.allSettled(this.#writes.values());
      await this.#files.removeWorkspace(workspace);
    } finally {
      this.#forgetting.delete(workspace);
    }
  }

  /** Adds `line` to the file's next write, starting one when none waits. */
  #add(
    workspace: string,
    integration: string,
    line: RequestLogLine,
    readCode?: CodeReader,
  ): Promise<void> {
    const file = fileName(workspace, integration);
    if (this.#forgetting.has(workspace)) return Promise.resolve();
    const key = fileKey(workspace, integration);
    let pending = this.#pending.get(key);
    if (pending === undefined) {
      const waiting = new PendingLines(this.#limit);
      waiting.written = this.#queue(workspace, integration, () =>
        this.#write(workspace, file, key, waiting),
      );
      this.#pending.set(key, waiting);
      pending = waiting;
    }
    pending.push(line, readCode);
    return pending.written;
  }

  /** Writes the waiting lines, unless a remove or a forget dropped them. */
  async #write(workspace: string, file: string, key: string, pending: PendingLines) {
    if (this.#pending.get(key) !== pending) return;
    this.#pending.delete(key);
    const code = codeIndex(pending.readCode === undefined ? "" : await pending.readCode());
    const added = pending.lines.map((line) =>
      line.type === "request" ? { ...line, path: maskedPath(line.path, code) } : line,
    );
    const lines = [...parseLines(await this.#files.read(workspace, file)), ...added];
    const kept = new Set([
      ...lastOf(lines, "request", this.#limit),
      ...lastOf(lines, "failure", this.#limit),
    ]);
    const text = lines
      .filter((each) => kept.has(each))
      .map((each) => `${JSON.stringify(each)}\n`)
      .join("");
    await this.#files.write(workspace, file, text);
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

/**
 * The lines waiting for one file's next write, in the order they came: at
 * most `limit` of each type, the oldest dropped first. A request's path is
 * masked only when it is written, against the code as it is then.
 */
class PendingLines {
  readonly lines: RequestLogLine[] = [];
  /** How to read the code, from the newest request. */
  readCode: CodeReader | undefined;
  /** Settles once these lines are written, or dropped. */
  written: Promise<void> = Promise.resolve();
  readonly #limit: number;

  constructor(limit: number) {
    this.#limit = limit;
  }

  push(line: RequestLogLine, readCode: CodeReader | undefined): void {
    this.lines.push(line);
    if (readCode !== undefined) this.readCode = readCode;
    const oldest = this.lines.find((each) => each.type === line.type);
    if (oldest !== undefined && this.#count(line.type) > this.#limit) {
      this.lines.splice(this.lines.indexOf(oldest), 1);
    }
  }

  #count(type: RequestLogLine["type"]): number {
    return this.lines.filter((each) => each.type === type).length;
  }
}

function isPlainHost(host: string): boolean {
  return host.length <= maxHostLength && hostPattern.test(host);
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
