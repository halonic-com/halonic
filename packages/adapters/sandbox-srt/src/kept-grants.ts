import { execFile } from "node:child_process";
import { win32 } from "node:path";
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

  /** A test hands in a fake `srt-win` and version. */
  constructor(run: RunSrtWin = runVendoredSrtWin, version: () => string = installedSrtVersion) {
    this.#run = run;
    this.#version = version;
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
   * Forgets the kept grants of this user inside any of `roots` that no live
   * session of this host holds: those of sessions that crashed before they
   * closed. A live session of another host process inside a root would lose
   * its grant, so only the one host that holds the profile's lock sweeps.
   * Lists the grants once, and starts nothing without a root.
   * Never rejects.
   */
  async sweep(roots: readonly string[]): Promise<ForgetResult> {
    if (roots.length === 0) return { heldByOthers: [], failed: [] };
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
    return this.#forgetUnheld(
      kept.filter((folder) => roots.some((root) => isInsideWindows(root, folder))),
    );
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

/** A folder as Windows compares it: resolved, letter case doesn't count. */
function windowsKey(folder: string): string {
  return win32.resolve(folder).toLowerCase();
}

/** Whether `child` is `parent` or inside it, as Windows reads paths. */
function isInsideWindows(parent: string, child: string): boolean {
  const path = win32.relative(windowsKey(parent), windowsKey(child));
  return path === "" || (!path.startsWith("..") && !win32.isAbsolute(path));
}
