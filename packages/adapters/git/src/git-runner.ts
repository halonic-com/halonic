import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { isAbsolutePath } from "./absolute-path.ts";
import { type FindGitOptions, findGit } from "./find-git.ts";
import { type ConfigEntry, hardenedEnvironment, hardeningConfig } from "./hardening.ts";
import { type ProcessResult, runProcess } from "./node/run-process.ts";

/** How {@link GitRunner.create} sets up git. Every field has a default. */
export interface GitRunnerOptions {
  /** The git program's absolute path; {@link findGit} by default. */
  git?: string;
  /**
   * A folder that stays empty, which every call points `core.hooksPath`
   * at; a new temporary folder by default, which {@link GitRunner.close}
   * removes. Each call checks it is still empty. A folder given here is
   * the caller's: the runner never removes it.
   */
  hooksFolder?: string;
  /** The environment git starts from, before the hardening; `process.env` by default. */
  environment?: Readonly<Record<string, string | undefined>>;
  /** Limit for a call that stays on this computer; 60 seconds by default. */
  localTimeoutMs?: number;
  /** Limit for `pull` and `push`; 5 minutes by default. */
  networkTimeoutMs?: number;
  /** Limit on one call's output; 64 MiB by default. */
  maxOutputBytes?: number;
}

/** One git call. */
export interface GitCall {
  /** The absolute folder it runs in. git never looks above it for a repository. */
  cwd: string;
  /** git's arguments, after the hardening the runner puts first. */
  args: readonly string[];
  /** Config added after the hardening, such as what neutralises the repository's own. */
  config?: readonly ConfigEntry[];
  /** Whether it reaches a remote, which gives it the longer time limit. */
  network?: boolean;
  /** An absolute index file to use in place of the repository's own (`GIT_INDEX_FILE`). */
  indexFile?: string;
}

/** What git gave back. A non-zero `code` is git's answer, not an error of the runner. */
export type GitResult = ProcessResult;

/**
 * Starts git, hardened on every call (the `Vcs` port's list): no shell,
 * hooks pointed at an empty folder, every inherited `GIT_*` variable
 * removed, no system or user config, the hardening config given in the
 * environment, and `PATH` cut down to its absolute folders, so neither git
 * nor a program it starts is ever found in the workspace.
 *
 * `HOME` and `XDG_CONFIG_HOME` stay as they are: `ssh` needs the user's
 * keys and known hosts. git reads no config from them, and the hardening
 * blanks the ignore and attributes files it would otherwise read there.
 */
export class GitRunner {
  readonly #git: string;
  readonly #hooksFolder: string;
  /** Whether the runner made the hooks folder, and so removes it on {@link close}. */
  readonly #ownsHooksFolder: boolean;
  #closed = false;
  readonly #environment: Readonly<Record<string, string | undefined>>;
  readonly #localTimeoutMs: number;
  readonly #networkTimeoutMs: number;
  readonly #maxOutputBytes: number;

  private constructor(git: string, hooksFolder: string, options: GitRunnerOptions) {
    this.#git = git;
    this.#hooksFolder = hooksFolder;
    this.#ownsHooksFolder = options.hooksFolder === undefined;
    this.#environment = withAbsolutePath(options.environment ?? process.env);
    this.#localTimeoutMs = options.localTimeoutMs ?? 60_000;
    this.#networkTimeoutMs = options.networkTimeoutMs ?? 300_000;
    this.#maxOutputBytes = options.maxOutputBytes ?? 64 * 1024 * 1024;
  }

  /**
   * A runner for the git program at `options.git`, or the one on the `PATH`.
   *
   * @throws Error when git isn't found, the path isn't absolute, or the hooks folder isn't empty
   */
  static async create(options: GitRunnerOptions = {}): Promise<GitRunner> {
    const git = options.git ?? (await findGit(searchPathOf(options)));
    if (!isAbsolutePath(git)) throw new Error(`The git program must be an absolute path: ${git}`);
    const hooksFolder =
      options.hooksFolder ?? (await mkdtemp(join(tmpdir(), "halonic-git-hooks-")));
    const runner = new GitRunner(git, hooksFolder, options);
    await runner.#checkHooksFolderIsEmpty();
    return runner;
  }

  /**
   * Runs one call, hardened.
   *
   * @throws Error when the runner is closed, `cwd` or `indexFile` isn't absolute, git can't start, passes its limits, or the hooks folder is no longer empty
   */
  async run(call: GitCall): Promise<GitResult> {
    if (this.#closed) throw new Error("This git runner is closed; create a new one.");
    // git ignores a relative GIT_CEILING_DIRECTORIES, so a relative `cwd`
    // would let it read a repository above the folder.
    if (!isAbsolutePath(call.cwd)) {
      throw new Error(`git runs only in an absolute folder, not ${call.cwd}`);
    }
    if (call.indexFile !== undefined && !isAbsolutePath(call.indexFile)) {
      throw new Error(`git takes only an absolute index file, not ${call.indexFile}`);
    }
    await this.#checkHooksFolderIsEmpty();
    const config: ConfigEntry[] = [
      ["core.hooksPath", this.#hooksFolder],
      ...hardeningConfig,
      ...(call.config ?? []),
    ];
    // git doesn't look for a repository above `cwd`, so a folder inside
    // another repository is never read as part of it.
    const extra: Record<string, string> = { GIT_CEILING_DIRECTORIES: dirname(call.cwd) };
    if (call.indexFile !== undefined) extra["GIT_INDEX_FILE"] = call.indexFile;
    return runProcess({
      program: this.#git,
      args: ["--no-pager", ...call.args],
      cwd: call.cwd,
      env: hardenedEnvironment(this.#environment, extra, config),
      timeoutMs: call.network === true ? this.#networkTimeoutMs : this.#localTimeoutMs,
      maxOutputBytes: this.#maxOutputBytes,
    });
  }

  /**
   * Ends the runner: later calls reject, and the hooks folder goes if the
   * runner made it. Closing twice does nothing more. Wait for the calls
   * still running first: git reads the hooks folder while it runs.
   */
  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#ownsHooksFolder) await rm(this.#hooksFolder, { recursive: true, force: true });
  }

  async #checkHooksFolderIsEmpty(): Promise<void> {
    const entries = await readdir(this.#hooksFolder);
    if (entries.length > 0) {
      throw new Error(
        `The empty hooks folder ${this.#hooksFolder} has files in it, so git won't run. Empty it and try again.`,
      );
    }
  }
}

/**
 * Where to look for git: the `PATH` of the environment the runner was
 * given, if any. Windows names it `Path`, and its names ignore case, so
 * any case counts.
 */
function searchPathOf(options: GitRunnerOptions): FindGitOptions {
  const environment = options.environment ?? {};
  const name = Object.keys(environment).find((key) => isPathName(key));
  const path = name === undefined ? undefined : environment[name];
  return path === undefined ? {} : { path };
}

/** `environment` with only the absolute folders of its `PATH` (or `Path`, on Windows). */
function withAbsolutePath(
  environment: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  const result = { ...environment };
  for (const name of Object.keys(result)) {
    if (!isPathName(name)) continue;
    result[name] = (result[name] ?? "")
      .split(delimiter)
      .filter((folder) => isAbsolutePath(folder))
      .join(delimiter);
  }
  return result;
}

function isPathName(name: string): boolean {
  return name.toUpperCase() === "PATH";
}
