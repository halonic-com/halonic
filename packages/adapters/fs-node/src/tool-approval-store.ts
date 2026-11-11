import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  keptWaitingVersions,
  type ToolApproval,
  type ToolApprovalKey,
  type ToolApprovalStore,
  UnreadableToolApprovalError,
  type WaitingVersion,
} from "@halonicjs/ports";
import { isMissing } from "./links.ts";
import { withRunLock } from "./run-lock.ts";
import {
  approvalFrom,
  formatApproval,
  formatWaiting,
  type Read,
  readApproval,
  readWaiting,
} from "./tool-approval-files.ts";

/** An approval's file name: the SHA-256 of the tool's name, then `.json`. */
const approvalFile = /^[0-9a-f]{64}\.json$/u;

/** The file in a source's folder that holds its waiting versions. */
const waitingFile = "waiting.json";

/** The lock file in a source's folder, taken for every write. */
const lockFile = "lock";

type SourceKey = Omit<ToolApprovalKey, "name">;

/**
 * Listed tool approvals as files in one folder of the user's profile, such
 * as `<profile>/tool-approvals`. Each source in each workspace has a folder
 * of its own, named by the SHA-256 of `[location, source]` as JSON, so the
 * key stays structured and no joined spelling of one key reaches another.
 * In it, each approval is one file named by the SHA-256 of the tool's name,
 * and `waiting.json` holds the source's waiting versions. Names never hold
 * the key itself, so a file system that folds case or normalises Unicode
 * still keeps keys apart.
 *
 * It fails closed:
 * - It refuses to work in a folder inside the workspace it is asked about,
 *   so a workspace can't arrive with its tools already approved.
 * - It reads a file only when it is exactly as Halonic writes it, with an
 *   `htl1:` fingerprint, and throws naming the tool otherwise. `revoke`
 *   still deletes it.
 * - It never overwrites an approval or waiting file a newer Halonic wrote.
 * - Every write goes through a temporary file and a rename, under the
 *   source's lock, with folders private to the user (`700`) and files too
 *   (`600`).
 *
 * A waiting file that can't be read is started again: waiting versions only
 * stop the host asking, so losing them only makes it ask again.
 */
export class FileToolApprovalStore implements ToolApprovalStore {
  readonly #root: string;

  /** @param root - the folder for the approvals, such as `<profile>/tool-approvals`; created on the first write */
  constructor(root: string) {
    this.#root = resolve(root);
  }

  async get(key: ToolApprovalKey): Promise<ToolApproval | null> {
    await this.#refuseInsideWorkspace(key.location);
    const file = this.#approvalPath(key);
    let text: string | undefined;
    try {
      text = await readText(file);
    } catch (error) {
      throw unreadable(key, file, error);
    }
    if (text === undefined) return null;
    return believed(key, file, readApproval(key, text));
  }

  async approve(approval: ToolApproval): Promise<void> {
    const key = { location: approval.location, source: approval.source, name: approval.name };
    await this.#refuseInsideWorkspace(key.location);
    const checked = approvalFrom(approval as unknown as Record<string, unknown>);
    if (typeof checked === "string") {
      throw new RangeError(`The approval for ${describeKey(key)} can't be stored: ${checked}.`);
    }
    const file = this.#approvalPath(key);
    await this.#withSourceLock(key, async () => {
      const existing = await readText(file);
      const found = existing === undefined ? null : readApproval(key, existing);
      if (found?.kind === "newer") throw newer(key, file, found.problem);
      await writePrivate(file, formatApproval(checked));
      await this.#forgetWaiting(key);
    });
  }

  async revoke(key: ToolApprovalKey): Promise<void> {
    // Deletes the file without reading it, so a damaged or newer approval goes too.
    const folder = this.#sourceFolder(key);
    try {
      await withRunLock(join(folder, lockFile), async () => {
        await rm(this.#approvalPath(key), { force: true });
        await this.#forgetWaiting(key);
      });
    } catch (error) {
      // No folder: the source has nothing to revoke.
      if (!isMissing(error)) throw error;
    }
  }

  async list(location: string, source: string): Promise<ToolApproval[]> {
    await this.#refuseInsideWorkspace(location);
    const folder = this.#sourceFolder({ location, source });
    let names: string[];
    try {
      names = await readdir(folder);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const approvals: ToolApproval[] = [];
    for (const entry of names.filter((name) => approvalFile.test(name))) {
      const file = join(folder, entry);
      let text: string | undefined;
      try {
        text = await readText(file);
      } catch (error) {
        throw unreadableFile({ location, source }, file, error);
      }
      // Revoked since the folder was read.
      if (text === undefined) continue;
      const name = nameIn(entry, text);
      if (name === undefined) throw unreadableFile({ location, source }, file);
      const key = { location, source, name };
      approvals.push(believed(key, file, readApproval(key, text)));
    }
    // By code unit, never by locale. Names are unique, so there is no tie.
    return approvals.sort((left, right) => (left.name < right.name ? -1 : 1));
  }

  async noteWaiting(key: ToolApprovalKey, version: WaitingVersion): Promise<WaitingVersion[]> {
    await this.#refuseInsideWorkspace(key.location);
    return this.#withSourceLock(key, async () => {
      const file = join(this.#sourceFolder(key), waitingFile);
      const found = await this.#readWaiting(key);
      if (found.kind === "newer") throw newerWaiting(key, file, found.problem);
      const waiting = found.kind === "read" ? found.value : new Map<string, WaitingVersion[]>();
      const kept = keptWaitingVersions(waiting, key.name, version);
      await writePrivate(file, formatWaiting(key, kept.waiting));
      return kept.versions;
    });
  }

  /**
   * Refuses a store folder inside the workspace at `location`, or the
   * workspace itself, comparing real paths, so a link can't hide it.
   * `location` is resolved too, so a second spelling of the same folder,
   * such as a Windows short name, can't slip past.
   */
  async #refuseInsideWorkspace(location: string): Promise<void> {
    const root = await realPathOf(this.#root);
    const workspace = await realPathOf(location);
    const path = relative(workspace, root);
    const outside = path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path);
    if (!outside) {
      throw new Error(
        `The tool approvals folder ${JSON.stringify(root)} is inside the workspace ${JSON.stringify(location)}. Approvals are never kept in a workspace, so a workspace can't arrive with its tools already approved.`,
      );
    }
  }

  async #withSourceLock<T>(key: SourceKey, work: () => Promise<T>): Promise<T> {
    const folder = this.#sourceFolder(key);
    await mkdir(folder, { recursive: true, mode: 0o700 });
    return withRunLock(join(folder, lockFile), work);
  }

  /** The source's waiting versions; a file that isn't there reads as none. */
  async #readWaiting(key: SourceKey): Promise<Read<Map<string, WaitingVersion[]>>> {
    const text = await readText(join(this.#sourceFolder(key), waitingFile));
    return text === undefined ? { kind: "read", value: new Map() } : readWaiting(key, text);
  }

  /** Forgets one tool's waiting versions, under the source's lock. Leaves a newer Halonic's file alone. */
  async #forgetWaiting(key: ToolApprovalKey): Promise<void> {
    const file = join(this.#sourceFolder(key), waitingFile);
    const found = await this.#readWaiting(key);
    if (found.kind === "newer") return;
    if (found.kind === "damaged") {
      await rm(file, { force: true });
      return;
    }
    if (!found.value.delete(key.name)) return;
    if (found.value.size === 0) {
      await rm(file, { force: true });
    } else {
      await writePrivate(file, formatWaiting(key, found.value));
    }
  }

  #sourceFolder(key: SourceKey): string {
    return join(this.#root, hashText(JSON.stringify([key.location, key.source])));
  }

  #approvalPath(key: ToolApprovalKey): string {
    return join(this.#sourceFolder(key), `${hashText(key.name)}.json`);
  }
}

/**
 * The hash of text's UTF-16 code units, little-endian. UTF-8 would turn
 * every lone surrogate into U+FFFD, so two different names would share one
 * file.
 */
function hashText(text: string): string {
  return createHash("sha256").update(text, "utf16le").digest("hex");
}

/**
 * The real path of `path`, or of its nearest folder that exists, with the
 * rest joined on: the store's folder may not exist yet.
 */
async function realPathOf(path: string): Promise<string> {
  const missing: string[] = [];
  let current = path;
  while (true) {
    try {
      return join(await realpath(current), ...missing.reverse());
    } catch (error) {
      const parent = dirname(current);
      if (!isMissing(error) || parent === current) throw error;
      missing.push(basename(current));
      current = parent;
    }
  }
}

/** A file's text, or `undefined` when it is gone. */
async function readText(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

/** Writes `text` through a temporary file and a rename, private to the user. */
async function writePrivate(file: string, text: string): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/**
 * The tool an approval file is for, read from its text, or `undefined` when
 * it can't be read there. It is only believed when its hash is the file's
 * name, so a damaged file can't name another tool.
 */
function nameIn(entry: string, text: string): string | undefined {
  let record: unknown;
  try {
    record = JSON.parse(text);
  } catch {
    return undefined;
  }
  const name = (record as { name?: unknown } | null)?.name;
  return typeof name === "string" && `${hashText(name)}.json` === entry ? name : undefined;
}

/** The approval that was read, or the error for one that wasn't. */
function believed(key: ToolApprovalKey, file: string, found: Read<ToolApproval>): ToolApproval {
  switch (found.kind) {
    case "read":
      return found.value;
    case "newer":
      throw newer(key, file, found.problem);
    case "damaged":
      throw unreadable(key, file, new Error(`It can't be believed: ${found.problem}.`));
  }
}

/** A key as people read it, such as `tool "lookup" of "notes" in "/workspaces/acme"`. */
function describeKey(key: ToolApprovalKey): string {
  return `tool ${JSON.stringify(key.name)} of ${describeSource(key)}`;
}

function describeSource(key: SourceKey): string {
  return `${JSON.stringify(key.source)} in ${JSON.stringify(key.location)}`;
}

function unreadable(key: ToolApprovalKey, file: string, cause: unknown): Error {
  return new UnreadableToolApprovalError(
    key,
    key.name,
    `The approval for ${describeKey(key)} can't be read (${JSON.stringify(file)}).`,
    { cause },
  );
}

function newer(key: ToolApprovalKey, file: string, problem: string): Error {
  return new UnreadableToolApprovalError(
    key,
    key.name,
    `The approval for ${describeKey(key)} was written by a newer Halonic (${problem}), so this one can't read it or replace it. Update Halonic, or revoke the approval (${JSON.stringify(file)}).`,
  );
}

function newerWaiting(key: SourceKey, file: string, problem: string): Error {
  return new Error(
    `The waiting tools of ${describeSource(key)} were written by a newer Halonic (${problem}), so this one leaves them alone. Update Halonic (${JSON.stringify(file)}).`,
  );
}

/** For an approval whose tool can't be read either: names the file, which can be deleted by hand. */
function unreadableFile(key: SourceKey, file: string, cause?: unknown): Error {
  return new UnreadableToolApprovalError(
    key,
    null,
    `An approval of ${describeSource(key)} can't be read, nor which tool it is for (${JSON.stringify(file)}). Delete the file to remove it.`,
    { cause },
  );
}
