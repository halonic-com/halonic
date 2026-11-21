import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, win32 } from "node:path";
import { installedSrtVersion } from "./srt-runner.ts";

/** The versions of sandbox-runtime whose `srt-win acl forget` this module was tried against. */
export const testedSrtVersions: readonly string[] = ["0.0.82"];

/** What one `srt-win` call gave. */
export interface SrtWinResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** What {@link KeptGrants} starts; a test hands in a fake. Never rejects for a non-zero exit. */
export type RunSrtWin = (args: string[]) => Promise<SrtWinResult>;

/** A folder whose kept grant could not be forgotten, with why. */
export interface ForgetFailure {
  folder: string;
  reason: string;
}

/** What forgetting some folders gave: the ones another live session of this host still uses (it forgets them when it closes), and the ones that failed. */
export interface ForgetResult {
  heldByOthers: string[];
  failed: ForgetFailure[];
}

/** The sentence `close()` rejects with for the failures. */
export function describeForgetFailures(failed: readonly ForgetFailure[]): string {
  return `Could not forget the kept Windows access grant on: ${failed
    .map((failure) => `${failure.folder} (${failure.reason})`)
    .join(", ")}`;
}

/** Where a host keeps its record of kept grants inside the profile, next to the host lock that decides who sweeps. */
export function keptGrantsRecordFolder(profileFolder: string): string {
  return join(profileFolder, "agent-host", "kept-grants");
}

/** Whether a process with this id is running (one we may not signal still is). */
function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as { code?: unknown }).code === "EPERM";
  }
}

/** A record file another host process left: its owner's id, and the folders it lists. */
interface ForeignRecord {
  file: string;
  folders: string[];
}

/** `srt-win` through the vendored binary of sandbox-runtime (it is what srt itself starts). */
const runVendoredSrtWin: RunSrtWin = async (args) => {
  const { resolveSrtWin, VENDORED_SRT_WIN_EXE } = await import("@anthropic-ai/sandbox-runtime");
  const { exe, prependArgs } = resolveSrtWin({ path: VENDORED_SRT_WIN_EXE });
  return new Promise((done) => {
    // Forgetting walks the folder's whole tree, as long as granting did.
    execFile(
      exe,
      [...prependArgs, ...args],
      { timeout: 600_000, windowsHide: true, encoding: "utf8" },
      (error, stdout, stderr) => {
        const code = (error as { code?: unknown } | null)?.code;
        let status: number | null = 0;
        if (error !== null) status = typeof code === "number" ? code : null;
        done({ status, stdout, stderr: stderr || (error?.message ?? "") });
      },
    );
  });
};

function oneLine(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join(" ");
}

/**
 * srt keeps a write grant on each session's folders after it ends, and that
 * grant beats a deny inherited from a parent folder, so a later session could
 * read an earlier session's files (HAL-5882). srt has no library call to take
 * it back; this is the one place that runs `srt-win acl forget` for it.
 * Windows only.
 *
 * `acl forget` checks for live sessions only with `--all`, not for named
 * folders, so which folders the live sessions of this host use is counted
 * here: a session holds its folders while it runs, and a folder is forgotten
 * only once no session holds it any more.
 */
export class KeptGrants {
  readonly #run: RunSrtWin;
  readonly #version: () => string;
  /** How many live sessions of this host use each folder, by {@link windowsKey}. */
  readonly #held = new Map<string, number>();

  /** The folder that holds one record file per host process, or null for no record. */
  readonly #recordFolder: string | null;
  /** This instance's own record file: only it writes there, so no two processes rewrite one file. */
  readonly #recordFile: string;
  /** The folders this instance recorded, by {@link windowsKey}. */
  readonly #recorded = new Map<string, string>();

  /**
   * A test hands in a fake `srt-win` and version. With a `recordFolder` (in
   * the profile, see {@link keptGrantsRecordFolder}), {@link record} writes
   * each folder there before srt grants it, so a crash between the grant and
   * its bookkeeping can't leave a grant nobody knows of.
   */
  constructor(
    run: RunSrtWin = runVendoredSrtWin,
    version: () => string = installedSrtVersion,
    recordFolder: string | null = null,
  ) {
    this.#run = run;
    this.#version = version;
    this.#recordFolder = recordFolder;
    this.#recordFile = join(recordFolder ?? "", `${process.pid}-${randomUUID()}.json`);
  }

  /**
   * Writes these folders to this process's record, before srt runs anything
   * that may grant them (write-ahead, HAL-5398 S2). Only a successful
   * `acl forget` takes a folder out again. Fails closed: when the record
   * can't be written, no session opens.
   *
   * @throws when the record can't be written
   */
  record(folders: readonly string[]): void {
    if (this.#recordFolder === null) return;
    const before = new Map(this.#recorded);
    for (const folder of folders) this.#recorded.set(windowsKey(folder), win32.resolve(folder));
    try {
      this.#writeRecord(this.#recordFile, this.#recorded.values());
    } catch (error) {
      this.#recorded.clear();
      for (const [key, folder] of before) this.#recorded.set(key, folder);
      throw new Error(
        `can't write the kept-grant record at ${this.#recordFile}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Replaces the record file with these folders, or removes it when there are none. */
  #writeRecord(file: string, folders: Iterable<string>): void {
    const list = [...folders];
    if (list.length === 0) {
      rmSync(file, { force: true });
      return;
    }
    mkdirSync(join(file, ".."), { recursive: true });
    const temp = `${file}.tmp`;
    writeFileSync(temp, JSON.stringify(list), { mode: 0o600 });
    renameSync(temp, file);
  }

  /** Takes these folders out of this process's record once their grants are forgotten. Never throws: a leftover entry only costs a repeat forget. */
  #unrecord(folders: readonly string[]): void {
    if (this.#recordFolder === null || folders.length === 0) return;
    for (const folder of folders) this.#recorded.delete(windowsKey(folder));
    try {
      this.#writeRecord(this.#recordFile, this.#recorded.values());
    } catch {
      // Left in the file; the next sweep forgets it again.
    }
  }

  /**
   * The record files of host processes that are gone, the folders in the
   * files of live ones (their sessions use them, so they are never swept),
   * and why a file can't be read.
   */
  #deadRecords(): { found: ForeignRecord[]; live: string[]; unreadable: ForgetFailure[] } {
    const found: ForeignRecord[] = [];
    const live: string[] = [];
    const unreadable: ForgetFailure[] = [];
    if (this.#recordFolder === null) return { found, live, unreadable };
    let names: string[];
    try {
      names = readdirSync(this.#recordFolder);
    } catch (error) {
      if ((error as { code?: unknown }).code === "ENOENT") return { found, live, unreadable };
      return {
        found,
        live,
        unreadable: [
          { folder: this.#recordFolder, reason: `the record can't be listed: ${errorText(error)}` },
        ],
      };
    }
    for (const name of names) {
      const owner = /^(\d+)-.+\.json$/.exec(name);
      const file = join(this.#recordFolder, name);
      if (owner === null || file === this.#recordFile) continue;
      const alive = processIsAlive(Number(owner[1]));
      try {
        const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
        if (!Array.isArray(parsed)) throw new Error("not a list of folders");
        const folders = parsed.filter((f): f is string => typeof f === "string");
        if (alive) live.push(...folders);
        else found.push({ file, folders });
      } catch (error) {
        // Nothing may be ruled out, so it stays and is reported at each start.
        unreadable.push({ folder: file, reason: `the record can't be read: ${errorText(error)}` });
      }
    }
    return { found, live, unreadable };
  }

  /** @throws when sandbox-runtime is a version `acl forget` was not tried against: fail closed, as grants it can't take back would stay. */
  assertSupported(): void {
    let version: string;
    try {
      version = this.#version();
    } catch (error) {
      throw new Error(
        `can't tell which sandbox-runtime is installed, so its kept Windows grants can't be forgotten: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!testedSrtVersions.includes(version)) {
      throw new Error(
        `sandbox-runtime ${version} is not tested with the forgetting of kept Windows grants (tested: ${testedSrtVersions.join(", ")}); not opening a session that would leave them behind`,
      );
    }
  }

  /** Records that a live session uses these folders, so no other session's close or sweep forgets them. */
  hold(folders: readonly string[]): void {
    for (const key of new Set(folders.map(windowsKey))) {
      this.#held.set(key, (this.#held.get(key) ?? 0) + 1);
    }
  }

  /**
   * Gives up one hold on each folder (if it had one), then forgets the kept
   * grant on each folder no other live session of this host holds. Never rejects.
   */
  async forget(folders: readonly string[]): Promise<ForgetResult> {
    for (const key of new Set(folders.map(windowsKey))) this.#release(key);
    return this.#forgetUnheld(folders);
  }

  async #forgetUnheld(folders: readonly string[]): Promise<ForgetResult> {
    const unique = [...new Map(folders.map((folder) => [windowsKey(folder), folder])).values()];
    const result: ForgetResult = { heldByOthers: [], failed: [] };
    for (const folder of unique) {
      if (this.#held.has(windowsKey(folder))) {
        result.heldByOthers.push(folder);
        continue;
      }
      const failure = await this.#forgetOne(folder);
      if (failure !== null) result.failed.push(failure);
      else this.#unrecord([folder]);
    }
    return result;
  }

  #release(key: string): void {
    const count = this.#held.get(key) ?? 0;
    if (count <= 1) this.#held.delete(key);
    else this.#held.set(key, count - 1);
  }

  async #forgetOne(folder: string): Promise<ForgetFailure | null> {
    try {
      const run = await this.#run(["acl", "forget", folder]);
      if (run.status === 0) return null;
      const why = oneLine(run.stderr || run.stdout);
      return { folder, reason: `exit ${run.status}${why === "" ? "" : `: ${why}`}` };
    } catch (error) {
      return { folder, reason: oneLine(error instanceof Error ? error.message : String(error)) };
    }
  }

  /**
   * Takes back every grant srt kept for this user, for a removal of the
   * sandbox: the profile read grant (`srt-win profile forget`) and the kept
   * write grants (`srt-win acl forget --all`). This is the half of srt's
   * uninstall that is the user's own, so it runs in this process, never with
   * the helper's administrator rights. Both refuse while a sandboxed program
   * runs. Never rejects.
   *
   * @returns why each one that failed did, empty when everything is forgotten
   */
  async forgetAll(): Promise<string[]> {
    try {
      this.assertSupported();
    } catch (error) {
      return [oneLine(error instanceof Error ? error.message : String(error))];
    }
    const failed: string[] = [];
    for (const [what, args] of [
      ["the profile read grant", ["profile", "forget"]],
      ["the kept write grants", ["acl", "forget", "--all"]],
    ] as const) {
      try {
        const run = await this.#run([...args]);
        if (run.status === 0) continue;
        const why = oneLine(run.stderr || run.stdout);
        failed.push(`${what}: exit ${run.status}${why === "" ? "" : `: ${why}`}`);
      } catch (error) {
        failed.push(`${what}: ${oneLine(error instanceof Error ? error.message : String(error))}`);
      }
    }
    return failed;
  }

  /**
   * Forgets the kept grants of this user that no live session of this host
   * holds, and that are inside any of `roots` or in the record of a host
   * process that is gone: those of sessions that crashed before they closed.
   * A live session of another host process would lose its grant, so only the
   * one host that holds the profile's lock sweeps, and it never touches the
   * record of a process that still runs. A recorded folder srt doesn't list
   * holds no kept grant (the crash came before srt made it), so it is only
   * taken out of the record. Lists the grants once, and starts nothing
   * without a root. Never rejects.
   */
  async sweep(roots: readonly string[]): Promise<ForgetResult> {
    if (roots.length === 0) return { heldByOthers: [], failed: [] };
    const { found, live, unreadable } = this.#deadRecords();
    let kept: string[];
    try {
      kept = await this.#listKept();
    } catch (error) {
      return {
        heldByOthers: [],
        failed: [
          {
            folder: roots.join(", "),
            reason: `the kept grants can't be listed: ${oneLine(error instanceof Error ? error.message : String(error))}`,
          },
        ],
      };
    }
    const listed = new Set(kept.map(windowsKey));
    const inLive = (folder: string): boolean =>
      live.some((used) => isInsideWindows(used, folder) || isInsideWindows(folder, used));
    const toForget = kept.filter(
      (folder) => roots.some((root) => isInsideWindows(root, folder)) && !inLive(folder),
    );
    const recorded = [...this.#recorded.values(), ...found.flatMap((record) => record.folders)];
    const dropped: string[] = [];
    const heldByLive: string[] = [];
    for (const folder of recorded) {
      if (inLive(folder)) {
        heldByLive.push(folder);
        continue;
      }
      if (this.#held.has(windowsKey(folder)) || listed.has(windowsKey(folder)))
        toForget.push(folder);
      else dropped.push(folder);
    }
    const result = await this.#forgetUnheld(toForget);
    // Left in the dead file for the next sweep, once the live process is gone.
    for (const folder of heldByLive) {
      if (!result.heldByOthers.some((held) => windowsKey(held) === windowsKey(folder)))
        result.heldByOthers.push(folder);
    }
    this.#unrecord(dropped);
    this.#settleDead(found, result);
    result.failed.push(...unreadable);
    return result;
  }

  /** Takes the folders that are forgotten, or never granted, out of the files of gone processes; a file with nothing left goes. */
  #settleDead(records: readonly ForeignRecord[], result: ForgetResult): void {
    const left = new Set(
      [...result.heldByOthers, ...result.failed.map((failure) => failure.folder)].map(windowsKey),
    );
    for (const record of records) {
      const remaining = record.folders.filter((folder) => left.has(windowsKey(folder)));
      try {
        this.#writeRecord(record.file, remaining);
      } catch {
        // Left in place; the next sweep goes over it again.
      }
    }
  }

  /**
   * The folders srt keeps write access to for this user that are outside
   * `known`, for the warning before a removal: they may belong to another
   * program that uses the same sandbox (HAL-7414, S-7). `unknown` is true
   * when srt's status can't be read or isn't in the shape this module knows,
   * since then nothing can be ruled out. Never rejects.
   */
  async foreignRoots(known: readonly string[]): Promise<{ folders: string[]; unknown: boolean }> {
    try {
      this.assertSupported();
      const kept = await this.#listKept(true);
      return {
        folders: kept.filter((folder) => !known.some((root) => isInsideWindows(root, folder))),
        unknown: false,
      };
    } catch {
      return { folders: [], unknown: true };
    }
  }

  /**
   * Whether srt lists kept grants for this user while its sandbox account is
   * gone (`srt-win user status`): what a removal run with administrator
   * rights, as from another account, leaves behind (HAL-5404 S2). A state
   * other than `none` counts as grants, as srt's own library reads it. False
   * when the status can't be read, or names no account at all. Never rejects.
   */
  async orphaned(): Promise<boolean> {
    try {
      this.assertSupported();
      const run = await this.#run(["user", "status"]);
      if (run.status !== 0) return false;
      const parsed = JSON.parse(run.stdout) as {
        user?: { exists?: unknown };
        persistent_grants?: { state?: unknown };
      };
      const state = parsed.persistent_grants?.state;
      return parsed.user?.exists === false && state !== undefined && state !== "none";
    } catch {
      return false;
    }
  }

  /** The kept grants' folders from `srt-win user status`; throws when it can't be read, and with `strict` when it has no list of roots. */
  async #listKept(strict = false): Promise<string[]> {
    const run = await this.#run(["user", "status"]);
    if (run.status !== 0)
      throw new Error(`exit ${run.status}: ${oneLine(run.stderr || run.stdout)}`);
    const parsed = JSON.parse(run.stdout) as { persistent_grants?: { roots?: unknown } };
    const listed = parsed.persistent_grants?.roots;
    if (!Array.isArray(listed)) {
      if (strict) throw new Error("no kept grants in status");
      return [];
    }
    return listed.filter((root): root is string => typeof root === "string");
  }
}

function errorText(error: unknown): string {
  return oneLine(error instanceof Error ? error.message : String(error));
}

/** A folder as Windows compares it: resolved, letter case doesn't count. */
function windowsKey(folder: string): string {
  return win32.resolve(folder).toLowerCase();
}

/** Whether `child` is `parent` or inside it, as Windows reads paths. */
function isInsideWindows(parent: string, child: string): boolean {
  const path = win32.relative(windowsKey(parent), windowsKey(child));
  return path === "" || (!path.startsWith("..") && !win32.isAbsolute(path));
}
