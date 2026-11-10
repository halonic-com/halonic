import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join, relative, resolve } from "node:path";
import { skillScriptsRefusal, touchesSkillScripts } from "@halonicjs/format";
import type {
  SandboxBlockListener,
  SandboxCommand,
  SandboxExit,
  SandboxFence,
  SandboxProcess,
  SandboxProfile,
  SandboxSession,
} from "@halonicjs/ports";
import { proveFence } from "./fence-proof.ts";
import { gitPathsToDeny } from "./git-deny-paths.ts";
import { type GitFolderSnapshot, restoreGitFolder, snapshotGitFolder } from "./git-folder-check.ts";
import { type NestedGitSnapshot, snapshotNestedGit, undoNestedGit } from "./nested-git-check.ts";
import { buildSrtConfig } from "./srt-config.ts";
import { nodePaths, type Runner, type RunningProgram } from "./srt-runner.ts";

/**
 * Variables sandbox-runtime reads from its own environment to find a parent
 * proxy. For that traffic it skips the check against private and loopback
 * addresses, so the launcher never gets them, whoever set them.
 */
const proxyVariables = new Set(
  ["http_proxy", "https_proxy", "all_proxy", "no_proxy", "grpc_proxy"].flatMap((name) => [
    name,
    name.toUpperCase(),
  ]),
);

/**
 * What a variable name may be. `env` runs without `-i`, so a name that starts
 * with `-` would be read as one of its options (`--unset=HTTP_PROXY`).
 */
const variableName = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** @throws when the profile has a variable whose name is not a plain one. */
function assertVariableNames(profile: SandboxProfile): void {
  for (const name of Object.keys(profile.env)) {
    if (!variableName.test(name)) {
      throw new Error(`the profile has a variable with a name that is not plain: ${name}`);
    }
  }
}

/** A folder as the PATH may name it: as given, and with symlinks resolved (`/var` is `/private/var` on macOS). */
function folderNames(folder: string): string[] {
  const names = [resolve(folder)];
  try {
    names.push(realpathSync(folder));
  } catch {
    // The folder is gone or unreadable: only its given name counts.
  }
  return names;
}

/**
 * A `PATH` without entries inside the session's private folder, so nothing
 * the launcher or the program runs is ever found there. Relative entries with
 * a `..` segment are dropped too: they resolve against the program's folder,
 * which Halonic cannot know, so they could lead into the private folder.
 */
function withoutPrivateFolder(path: string, privateFolder: string | undefined): string {
  if (privateFolder === undefined) return path;
  const folders = folderNames(privateFolder);
  return path
    .split(delimiter)
    .filter((entry) => {
      if (entry === "") return true;
      if (!isAbsolute(entry) && entry.split(/[\\/]/).includes("..")) return false;
      return !folderNames(entry).some((name) => folders.some((folder) => isInside(folder, name)));
    })
    .join(delimiter);
}

/**
 * The host's `PATH` without relative entries, without entries the program
 * can write and without entries in the private folder.
 */
function safePath(profile: SandboxProfile, hostPath: string, privateFolder?: string): string {
  const writable = [resolve(profile.workingFolder), resolve(profile.tempFolder)];
  return withoutPrivateFolder(
    hostPath
      .split(delimiter)
      .filter(
        (entry) =>
          isAbsolute(entry) && !writable.some((folder) => isInside(folder, resolve(entry))),
      )
      .join(delimiter),
    privateFolder,
  );
}

/**
 * The environment of the launcher, which runs outside the fence: the safe
 * host `PATH` and the session's temp folder. Nothing from the profile, so
 * nothing the program influences (a planted `bwrap` on the path,
 * `NODE_OPTIONS`, `LD_PRELOAD`) runs before the fence exists.
 */
export function launcherEnv(
  profile: SandboxProfile,
  hostEnv: Record<string, string | undefined> = process.env,
  privateFolder?: string,
): Record<string, string> {
  const env: Record<string, string> = {};
  const hostPath = hostEnv["PATH"];
  if (hostPath !== undefined) env["PATH"] = safePath(profile, hostPath, privateFolder);
  env["TMPDIR"] = profile.tempFolder;
  return env;
}

/**
 * The variables the program gets, set inside the fence on top of what srt
 * sets there (its proxy variables): the safe host `PATH` when the profile has
 * none, the session's temp folder and the profile's variables. Never the rest
 * of the host's environment, and never a proxy variable of the profile. A
 * `PATH` of the profile loses its entries in the private folder.
 *
 * @throws when a variable of the profile has a name that is not plain.
 */
export function programEnv(
  profile: SandboxProfile,
  hostEnv: Record<string, string | undefined> = process.env,
  privateFolder?: string,
): Record<string, string> {
  assertVariableNames(profile);
  const env = launcherEnv(profile, hostEnv, privateFolder);
  for (const [name, value] of Object.entries(profile.env)) {
    if (proxyVariables.has(name)) continue;
    env[name] = name === "PATH" ? withoutPrivateFolder(value, privateFolder) : value;
  }
  return env;
}

/** Whether `child` is `parent` or inside it. */
function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

/** One started program: what the session tracks to stop it and to say why it ended. */
interface Started {
  program: RunningProgram;
  stopped: boolean;
  timedOut: boolean;
}

function exitReason(started: Started): SandboxExit["reason"] {
  if (started.timedOut) return "timeout";
  return started.stopped ? "stopped" : "exited";
}

/**
 * A sandbox-runtime session. It owns a private folder (the settings file and
 * the canary of the fence proof) that the program can't read, removed when
 * the session closes.
 */
export class SrtSession implements SandboxSession {
  readonly profile: SandboxProfile;
  readonly #runner: Runner;
  readonly #folder: string;
  readonly #settingsPath: string;
  readonly #launcherEnv: Record<string, string>;
  readonly #programEnv: Record<string, string>;
  readonly #started = new Set<Started>();
  readonly #listeners = new Set<SandboxBlockListener>();
  readonly #timer: NodeJS.Timeout;
  readonly #detach: () => void;
  readonly #gitFolder: GitFolderSnapshot | null;
  readonly #nestedGit: NestedGitSnapshot | null;
  #fence: SandboxFence;
  #closing: Promise<void> | null = null;
  #timedOut = false;

  private constructor(
    profile: SandboxProfile,
    runner: Runner,
    folder: string,
    settingsPath: string,
    fence: SandboxFence,
    signal: AbortSignal | undefined,
    git: { folder: GitFolderSnapshot | null; nested: NestedGitSnapshot | null },
  ) {
    this.profile = profile;
    this.#runner = runner;
    this.#folder = folder;
    this.#settingsPath = settingsPath;
    this.#fence = fence;
    this.#gitFolder = git.folder;
    this.#nestedGit = git.nested;
    this.#launcherEnv = launcherEnv(profile, process.env, folder);
    this.#programEnv = programEnv(profile, process.env, folder);
    this.#timer = setTimeout(() => void this.#expire(), profile.timeLimitMs);
    this.#timer.unref();
    // Nobody awaits the abort handler, so a failed undo has no caller to reach there: `close()` reports it.
    const abort = () => void this.close().catch(() => undefined);
    signal?.addEventListener("abort", abort, { once: true });
    this.#detach = () => signal?.removeEventListener("abort", abort);
    if (signal?.aborted) abort();
  }

  /**
   * Opens a session: writes its settings, proves the fence and returns. The
   * proof is settled before any program the caller starts. The time limit
   * counts from `startedAt`.
   */
  static async open(
    profile: SandboxProfile,
    runner: Runner,
    options: { signal?: AbortSignal } = {},
  ): Promise<SrtSession> {
    const startedAt = Date.now();
    assertVariableNames(profile);
    await mkdir(profile.tempFolder, { recursive: true });
    const git = {
      folder: await snapshotGitFolder(profile.workingFolder),
      nested: await snapshotNestedGit(profile.workingFolder),
    };
    const folder = await mkdtemp(join(tmpdir(), "halonic-srt-"));
    try {
      const settingsPath = join(folder, "settings.json");
      const config = buildSrtConfig(profile, [folder], await gitPathsToDeny(profile.workingFolder));
      await writeFile(settingsPath, JSON.stringify(config), { mode: 0o600 });
      const fence = await proveFence({
        runner,
        settingsPath,
        canaryFolder: join(folder, "canary"),
        tempFolder: profile.tempFolder,
        workingFolder: profile.workingFolder,
        launcherEnv: launcherEnv(profile, process.env, folder),
        // The probe gets none of the profile's variables: it proves the fence, not the program's setup.
        programEnv: launcherEnv(profile, process.env, folder),
      });
      const remaining = {
        ...profile,
        timeLimitMs: Math.max(0, profile.timeLimitMs - (Date.now() - startedAt)),
      };
      const session = new SrtSession(
        remaining,
        runner,
        folder,
        settingsPath,
        fence,
        options.signal,
        git,
      );
      return session;
    } catch (error) {
      await rm(folder, { recursive: true, force: true });
      throw error;
    }
  }

  get fence(): SandboxFence {
    return this.#fence;
  }

  async start(command: SandboxCommand): Promise<SandboxProcess> {
    if (this.#closing !== null) throw new Error("the sandbox session is closed");
    if (this.#fence.state !== "fenced") {
      const why = this.#fence.state === "not-fenced" ? this.#fence.reason : "the session is closed";
      throw new Error(`the sandbox fence is not proven: ${why}`);
    }
    const cwd = resolve(this.profile.workingFolder, command.cwd ?? ".");
    if (!isInside(resolve(this.profile.workingFolder), cwd)) {
      throw new Error(`the program must start inside the working folder, not in ${cwd}`);
    }
    if (
      await touchesSkillScripts({ cwd, program: command.program, args: command.args }, nodePaths)
    ) {
      throw new Error(skillScriptsRefusal);
    }
    const program = await this.#runner.run({
      settingsPath: this.#settingsPath,
      program: command.program,
      args: command.args,
      cwd,
      launcherEnv: this.#launcherEnv,
      programEnv: this.#programEnv,
    });
    const started: Started = { program, stopped: false, timedOut: false };
    this.#started.add(started);
    // The session may have closed while the program was launching.
    if (this.#closing !== null) await this.#stop(started, this.#timedOut);
    const exited: Promise<SandboxExit> = program.ended.then(({ code, signal }) => {
      this.#started.delete(started);
      return { code, signal, reason: exitReason(started) };
    });
    return {
      stdin: program.stdin,
      stdout: program.stdout,
      stderr: program.stderr,
      exited,
      kill: async () => {
        await this.#stop(started);
      },
    };
  }

  onBlocked(listener: SandboxBlockListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  close(): Promise<void> {
    this.#closing ??= this.#shutDown(false);
    return this.#closing;
  }

  async #expire(): Promise<void> {
    this.#timedOut ||= this.#closing === null;
    this.#closing ??= this.#shutDown(true);
    // Nobody awaits the timer, so a failed undo has no caller to reach there: `close()` reports it.
    await this.#closing.catch(() => undefined);
  }

  async #shutDown(timedOut: boolean): Promise<void> {
    clearTimeout(this.#timer);
    this.#detach();
    await Promise.all([...this.#started].map((started) => this.#stop(started, timedOut)));
    const failed = await this.#checkGitFolder();
    this.#fence = { state: "stopped" };
    this.#listeners.clear();
    await rm(this.#folder, { recursive: true, force: true });
    if (failed.length > 0) {
      throw new Error(`Could not undo a change to the git folder: ${failed.join(", ")}`);
    }
  }

  /**
   * Undoes what the program did to the working folder's git setup, once
   * nothing it started is left to change it again, and reports each one as a
   * refused write.
   *
   * @returns the paths it could not undo, so `close()` can reject with them.
   */
  async #checkGitFolder(): Promise<string[]> {
    const { undone, failed } = await this.#undoGitChanges();
    for (const path of [...undone, ...failed]) {
      for (const listener of this.#listeners) listener({ kind: "file", path, access: "write" });
    }
    return failed;
  }

  /**
   * Both git checks: the `commondir` files, and the `.git` of each gitlink
   * the program planted or changed (also in a submodule that was not checked
   * out at start, whose `.git` the fence can't deny).
   */
  async #undoGitChanges(): Promise<{ undone: string[]; failed: string[] }> {
    const undone: string[] = [];
    const failed: string[] = [];
    if (this.#gitFolder !== null) {
      const folder = await restoreGitFolder(this.#gitFolder);
      undone.push(...folder.undone);
      failed.push(...folder.failed);
    }
    const nestedGit = this.#nestedGit;
    if (nestedGit !== null) {
      const nested = await undoNestedGit(nestedGit);
      const inFolder = (path: string) => join(nestedGit.workingFolder, path);
      undone.push(...nested.undone.map(inFolder));
      failed.push(...nested.failed.map(inFolder));
    }
    return { undone, failed };
  }

  async #stop(started: Started, timedOut = false): Promise<void> {
    started.stopped = true;
    started.timedOut ||= timedOut;
    started.program.killTree();
    await started.program.ended;
  }
}
