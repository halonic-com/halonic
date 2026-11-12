import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
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
import {
  checkCommondirs,
  type GitFolderSnapshot,
  restoreGitFolder,
  snapshotGitFolder,
  writeJournal,
} from "./git-folder-check.ts";
import { describeForgetFailures, type ForgetFailure, type KeptGrants } from "./kept-grants.ts";
import { makeLauncherTemp } from "./launcher-temp.ts";
import { type NestedGitSnapshot, snapshotNestedGit, undoNestedGit } from "./nested-git-check.ts";
import { assertSharedFolders } from "./shared-folders.ts";
import { buildSrtConfig } from "./srt-config.ts";
import { nodePaths, type Runner, type RunningProgram } from "./srt-runner.ts";
import {
  assertVariableNames,
  baseEnv,
  isInside,
  launcherEnv,
  programEnv,
  reachesNoNetwork,
} from "./srt-session-env.ts";

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
 * the canary of the fence proof) that the program can't read, and outside
 * Windows the launcher's own temp folder, both removed when the session closes.
 */
export class SrtSession implements SandboxSession {
  readonly profile: SandboxProfile;
  readonly #runner: Runner;
  readonly #folder: string;
  readonly #launcherTemp: string | null;
  readonly #settingsPath: string;
  readonly #launcherEnv: Record<string, string>;
  readonly #programEnv: Record<string, string>;
  readonly #started = new Set<Started>();
  readonly #listeners = new Set<SandboxBlockListener>();
  readonly #timer: NodeJS.Timeout;
  readonly #detach: () => void;
  readonly #gitFolder: GitFolderSnapshot | null;
  readonly #nestedGit: NestedGitSnapshot | null;
  readonly #journal: string | null;
  readonly #grants: KeptGrants | null;
  #fence: SandboxFence;
  #closing: Promise<void> | null = null;
  #timedOut = false;

  private constructor(
    profile: SandboxProfile,
    remainingMs: number,
    runner: Runner,
    folder: string,
    launcherTemp: string | null,
    settingsPath: string,
    fence: SandboxFence,
    signal: AbortSignal | undefined,
    git: { folder: GitFolderSnapshot | null; nested: NestedGitSnapshot | null },
    journal: string | null,
    grants: KeptGrants | null,
  ) {
    this.profile = profile;
    this.#runner = runner;
    this.#folder = folder;
    this.#launcherTemp = launcherTemp;
    this.#settingsPath = settingsPath;
    this.#fence = fence;
    this.#gitFolder = git.folder;
    this.#nestedGit = git.nested;
    this.#journal = journal;
    this.#grants = grants;
    this.#launcherEnv = launcherEnv(profile, process.env, folder, launcherTemp);
    this.#programEnv = programEnv(profile, process.env, folder);
    this.#timer = setTimeout(() => void this.#expire(), remainingMs);
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
   * counts from `startedAt`. Each of the `sharedFolders` is denied for
   * reading as a whole, except the profile's own folders inside it.
   *
   * @throws when a shared folder is missing or isn't a folder
   */
  static async open(
    profile: SandboxProfile,
    runner: Runner,
    options: {
      signal?: AbortSignal;
      journalFolder?: string | null;
      /** On Windows: takes back the grants srt keeps on the session's folders. Without it nothing is forgotten. */
      grants?: KeptGrants | null;
      /** Where a failure to forget is logged when no caller can get it. */
      warn?: (message: string) => void;
      sharedFolders?: readonly string[];
    } = {},
  ): Promise<SrtSession> {
    const startedAt = Date.now();
    const grants = options.grants ?? null;
    grants?.assertSupported();
    assertVariableNames(profile);
    const { journalFolder = null, sharedFolders = [] } = options;
    await assertSharedFolders(sharedFolders);
    await mkdir(profile.tempFolder, { recursive: true });
    await checkCommondirs(profile.workingFolder);
    const git = {
      folder: await snapshotGitFolder(profile.workingFolder),
      nested: await snapshotNestedGit(profile.workingFolder),
    };
    const folder = await mkdtemp(join(tmpdir(), "halonic-srt-"));
    let journal: string | null = null;
    let launcherTemp: string | null = null;
    // Held from here, before srt runs anything: the forget in the `catch` below or `close()` gives the hold up.
    grants?.hold([profile.workingFolder, profile.tempFolder]);
    try {
      launcherTemp = await makeLauncherTemp();
      if (git.folder !== null && journalFolder !== null) {
        journal = await writeJournal(journalFolder, basename(folder), git.folder);
      }
      const settingsPath = join(folder, "settings.json");
      const config = buildSrtConfig(
        profile,
        journalFolder === null ? [folder] : [folder, journalFolder],
        await gitPathsToDeny(profile.workingFolder),
        process.platform,
        sharedFolders,
      );
      await writeFile(settingsPath, JSON.stringify(config), { mode: 0o600 });
      const fence = await proveFence({
        runner,
        settingsPath,
        canaryFolder: join(folder, "canary"),
        tempFolder: profile.tempFolder,
        workingFolder: profile.workingFolder,
        launcherEnv: launcherEnv(profile, process.env, folder, launcherTemp),
        // The probe gets none of the profile's variables: it proves the fence, not the program's setup.
        programEnv: baseEnv(profile, process.env, folder),
        withoutSrtEnv: reachesNoNetwork(profile),
      });
      // The proof's time counts against the limit, but `profile` stays the one the session was
      // opened with, as the port says: a caller may compare it with the profile it built.
      const remainingMs = Math.max(0, profile.timeLimitMs - (Date.now() - startedAt));
      const session = new SrtSession(
        profile,
        remainingMs,
        runner,
        folder,
        launcherTemp,
        settingsPath,
        fence,
        options.signal,
        git,
        journal,
        grants,
      );
      return session;
    } catch (error) {
      await rm(folder, { recursive: true, force: true });
      if (launcherTemp !== null) await rm(launcherTemp, { recursive: true, force: true });
      if (journal !== null) await rm(journal, { force: true });
      // The fence proof ran a program on the folders, so srt may have kept grants on them.
      const forgotten = await grants?.forget([profile.workingFolder, profile.tempFolder]);
      if (forgotten !== undefined && forgotten.failed.length > 0) {
        (options.warn ?? (() => undefined))(describeForgetFailures(forgotten.failed));
      }
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
    // The profile's variables, which Halonic sets, are read too; the safe host `PATH` isn't (HAL-4903).
    const start = { cwd, program: command.program, args: command.args, env: this.profile.env };
    if (await touchesSkillScripts(start, nodePaths)) {
      throw new Error(skillScriptsRefusal);
    }
    const program = await this.#runner.run({
      settingsPath: this.#settingsPath,
      program: command.program,
      args: command.args,
      cwd,
      launcherEnv: this.#launcherEnv,
      programEnv: this.#programEnv,
      withoutSrtEnv: reachesNoNetwork(this.profile),
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
    const notForgotten = await this.#forgetGrants();
    this.#fence = { state: "stopped" };
    this.#listeners.clear();
    await rm(this.#folder, { recursive: true, force: true });
    if (this.#launcherTemp !== null) await rm(this.#launcherTemp, { recursive: true, force: true });
    // A journal whose undo failed stays, so a later `recoverGitFolders` tries again.
    if (this.#journal !== null && failed.length === 0) await rm(this.#journal, { force: true });
    const problems: string[] = [];
    if (failed.length > 0) {
      problems.push(`Could not undo a change to the git folder: ${failed.join(", ")}`);
    }
    if (notForgotten.length > 0) problems.push(describeForgetFailures(notForgotten));
    if (problems.length > 0) throw new Error(problems.join("; "));
  }

  /**
   * Takes back the write grants srt kept on the working and temp folders
   * (Windows), once nothing the session started is left. A folder another
   * live session of this host uses stays; that session forgets it when it closes.
   *
   * @returns the folders it could not free, so `close()` can reject with them.
   */
  async #forgetGrants(): Promise<ForgetFailure[]> {
    if (this.#grants === null) return [];
    const { failed } = await this.#grants.forget([
      this.profile.workingFolder,
      this.profile.tempFolder,
    ]);
    return failed;
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
