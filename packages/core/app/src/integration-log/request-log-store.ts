// The local request log of each integration, kept in the profile so the
// integration debugger can read it after a restart (HAL-18391 plan, section
// 2.2). It lives outside every workspace, so "Offer to Halonic" can't include
// it and a workspace file can't plant entries in it. It holds no query, no
// headers and no bodies, as the kit's log doesn't, and paths are masked when
// an entry is written, never when it is read (Liam, HAL-18391).

import { maskedSegment, PathMasker } from "./masked-path.ts";

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

/**
 * Reads the integration's code as it is now, for masking. The store calls it
 * once for each write that holds requests, never earlier, and keeps no copy.
 */
export type ReadCode = () => Promise<string>;

/** A line waiting for its file's next write, with the promise its add returned. */
interface WaitingLine {
  /** For a request, the path is masked only when the line is written. */
  readonly line: RequestLogLine;
  readonly readCode: ReadCode | undefined;
  readonly settle: (error?: unknown) => void;
}

/**
 * The store of every integration's local request log.
 *
 * A runner can make refused requests in a tight loop, so writes are bounded
 * (Julian, HAL-19170). While a file's write runs, new lines wait, then go in
 * one write with one read of the code. At most `limit` requests and `limit`
 * failure notes wait for each file; past that the oldest of that type is
 * dropped, as the file would drop it anyway, and its add resolves at once.
 */
export class RequestLogStore {
  readonly #files: RequestLogFiles;
  readonly #limit: number;
  /** The last write queued for each file, so two writes never interleave. */
  readonly #writes = new Map<string, Promise<void>>();
  /** The lines waiting for each file's next write; that write is already queued. */
  readonly #waiting = new Map<string, WaitingLine[]>();
  readonly #now: () => Date;

  /** @param limit - how many requests, and how many failure notes, each file keeps */
  constructor(files: RequestLogFiles, options: { limit?: number; now?: () => Date } = {}) {
    this.#files = files;
    this.#limit = options.limit ?? 200;
    this.#now = options.now ?? (() => new Date());
  }

  /**
   * Adds a request. When it is written, every path segment the code doesn't
   * hold is masked, against the code as `readCode` reads it then. A method
   * or host that isn't in its plain shape is stored as `{…}`; an empty host
   * stays empty. Lines are written in the order they were added.
   *
   * @param readCode - reads the integration's code as it is at write time
   * @throws RangeError when the workspace key or integration id can't name a file
   */
  async addRequest(
    workspace: string,
    integration: string,
    request: LoggedRequest,
    readCode: ReadCode,
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
    await this.#add(workspace, integration, line, readCode);
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

  /** The integration's log, oldest first, once the lines added before are written. */
  async lines(workspace: string, integration: string): Promise<RequestLogLine[]> {
    await this.#writes.get(fileKey(workspace, integration))?.catch(() => undefined);
    return parseLines(await this.#files.read(workspace, fileName(workspace, integration)));
  }

  /** Deletes the integration's log, as when the integration is removed, dropping what waits first. */
  async removeIntegration(workspace: string, integration: string): Promise<void> {
    const file = fileName(workspace, integration);
    const key = fileKey(workspace, integration);
    this.#dropWaiting(key);
    await this.#queue(key, () => this.#files.remove(workspace, file));
  }

  /**
   * Deletes the logs of every integration in the workspace, as when the
   * workspace is forgotten. What waits is dropped first, and a write already
   * running is waited for, so it can't bring the folder back.
   */
  async forgetWorkspace(workspace: string): Promise<void> {
    checkWorkspace(workspace);
    const keys = [...this.#writes.keys()].filter((key) => key.startsWith(`${workspace}/`));
    for (const key of keys) this.#dropWaiting(key);
    await Promise.allSettled(keys.map((key) => this.#writes.get(key)));
    await this.#files.removeWorkspace(workspace);
  }

  /**
   * Puts the line in the file's waiting batch, queueing that batch's write
   * when it is the first line. Runs before its caller's first `await`, so
   * lines wait in the order they were added.
   */
  #add(
    workspace: string,
    integration: string,
    line: RequestLogLine,
    readCode?: ReadCode,
  ): Promise<void> {
    const file = fileName(workspace, integration);
    const key = fileKey(workspace, integration);
    return new Promise((resolve, reject) => {
      let batch = this.#waiting.get(key);
      if (batch === undefined) {
        const queued: WaitingLine[] = [];
        this.#waiting.set(key, queued);
        void this.#queue(key, () => this.#writeBatch(workspace, file, key, queued)).catch(
          () => undefined,
        );
        batch = queued;
      }
      batch.push({
        line,
        readCode,
        settle: (error) => (error === undefined ? resolve() : reject(error)),
      });
      this.#dropOldest(batch, line.type);
    });
  }

  /** Drops the oldest waiting line of `type` while more than the limit wait. */
  #dropOldest(batch: WaitingLine[], type: RequestLogLine["type"]): void {
    if (batch.filter((waiting) => waiting.line.type === type).length <= this.#limit) return;
    const oldest = batch.findIndex((waiting) => waiting.line.type === type);
    const [dropped] = batch.splice(oldest, 1);
    dropped?.settle();
  }

  /** Drops every line waiting for the file; their adds resolve, and the queued write finds nothing. */
  #dropWaiting(key: string): void {
    const batch = this.#waiting.get(key);
    this.#waiting.delete(key);
    for (const waiting of batch?.splice(0) ?? []) waiting.settle();
  }

  /** Writes the batch with the file's kept lines, reading the code once if it holds a request. */
  async #writeBatch(
    workspace: string,
    file: string,
    key: string,
    batch: WaitingLine[],
  ): Promise<void> {
    // From here on, new lines wait for the next write.
    if (this.#waiting.get(key) === batch) this.#waiting.delete(key);
    if (batch.length === 0) return;
    try {
      const added = await maskedLines(batch);
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
      for (const waiting of batch) waiting.settle();
    } catch (error) {
      for (const waiting of batch) waiting.settle(error);
      throw error;
    }
  }

  /** Runs `write` after the file's earlier writes; a failed write doesn't stop the next one. */
  async #queue(key: string, write: () => Promise<void>): Promise<void> {
    const next = (this.#writes.get(key) ?? Promise.resolve()).catch(() => undefined).then(write);
    this.#writes.set(key, next);
    try {
      await next;
    } finally {
      if (this.#writes.get(key) === next) this.#writes.delete(key);
    }
  }
}

/** The batch's lines, each request's path masked against one read of the code. */
async function maskedLines(batch: readonly WaitingLine[]): Promise<RequestLogLine[]> {
  const readCode = batch.findLast((waiting) => waiting.readCode !== undefined)?.readCode;
  const masker = readCode === undefined ? undefined : new PathMasker(await readCode());
  return batch.map(({ line }) =>
    line.type === "request" && masker !== undefined
      ? { ...line, path: masker.masked(line.path) }
      : line,
  );
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
