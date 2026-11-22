import { lstat, realpath } from "node:fs/promises";
import { join } from "node:path";
import { CallChecks, skipsNestedListing } from "./check-scope.ts";
import type { GitResult, GitRunner } from "./git-runner.ts";
import type { ConfigEntry } from "./hardening.ts";
import {
  blankFilters,
  checkRefusedKeys,
  filterNames,
  hasCommandEntry,
  type ListedConfig,
  neutralisePrograms,
  parseConfigListing,
} from "./repo-config.ts";
import { checkOptions, checkSubcommand, withoutDiffPrograms } from "./repository-args.ts";
import {
  checkAlternates,
  checkGitPaths,
  checkLocated,
  checkNestedInside,
  gitPathArgs,
  gitPaths,
  linksInGitFolder,
  locateNestedArgs,
  outsideFolder,
} from "./repository-location.ts";

/** A call in a checked repository. */
export interface RepositoryCall {
  args: readonly string[];
  /** Config for this call only, after the rest. */
  config?: readonly ConfigEntry[];
  /** Whether it reaches a remote. */
  network?: boolean;
  /** An absolute index file to use in place of the repository's own. */
  indexFile?: string;
  /** A worktree to run in, in place of the workspace; see {@link WorktreeLocation}. */
  worktree?: WorktreeLocation;
  /** What git reads as its input. */
  input?: Buffer;
}

/**
 * Where a worktree's git files and files are. The caller checks both: git
 * gets them explicitly, so it never reads the `.git` file in the worktree's
 * folder, which whatever ran there could have rewritten (HAL-3188).
 */
export interface WorktreeLocation {
  /** Git's record of the worktree, `.git/worktrees/<id>` in the repository. */
  gitDir: string;
  /** The worktree's folder. */
  folder: string;
}

/** What a caller needs to run git in a repository: {@link Repository} and {@link RepositoryReader} both give it. */
export interface GitCalls {
  /** Runs git and gives its result, whatever the exit code. */
  run(call: RepositoryCall): Promise<GitResult>;
  /** Runs git and gives its output; throws with git's message on a failure. */
  output(call: RepositoryCall): Promise<Buffer>;
}

/** How a port call gets its {@link Repository}: see {@link Repository.forCall}. */
export interface CallOptions {
  /**
   * Whether to check on opening too: for a port call that reads or writes
   * a file in the repository before its first git command.
   */
  checkAtOpen: boolean;
  /** The error when the folder is no repository. */
  notARepository: () => Error;
}

/**
 * The repository at one workspace folder, checked before every call: the
 * folder is its root, all of its files are inside the folder, and the
 * programs its own config names are neutralised. One made for a port call
 * ({@link Repository.forCall}) holds a check for the commands after it, as
 * long as they can't change what it read.
 */
export class Repository implements GitCalls {
  readonly #runner: GitRunner;
  readonly #top: string;
  readonly #gitDir: string;
  /** The checks of a port call; `null` checks before every call. */
  readonly #calls: CallChecks<ConfigEntry[]> | null;
  readonly #notARepository: (() => Error) | null;
  #checkedOnce = false;

  private constructor(runner: GitRunner, top: string, call?: CallOptions) {
    this.#runner = runner;
    this.#top = top;
    this.#gitDir = join(top, ".git");
    this.#calls = call === undefined ? null : new CallChecks();
    this.#notARepository = call?.notARepository ?? null;
  }

  /**
   * The repository whose root is `folder`, or `null` when the folder isn't
   * one: no repository at all, or a folder inside another one.
   *
   * @throws Error when the repository keeps files outside the folder, or its config can't be read or sets a refused key
   */
  static async open(runner: GitRunner, folder: string): Promise<Repository | null> {
    const repository = new Repository(runner, await realpath(folder));
    return (await repository.#check(true)) === null ? null : repository;
  }

  /**
   * The repository for one port call. Its first git command checks in full,
   * and the check holds for the commands after it until one could change
   * what the check read ({@link keepsCheck}) or the adapter writes a file
   * itself ({@link Repository.changed}); the next command then checks again.
   * Nothing is kept from another call or from {@link Repository.open}: with
   * `checkAtOpen`, that check is made and dropped.
   *
   * @throws Error from `notARepository` when the folder is no repository, and as {@link Repository.open} with `checkAtOpen`
   */
  static async forCall(runner: GitRunner, folder: string, call: CallOptions): Promise<Repository> {
    const repository = new Repository(runner, await realpath(folder), call);
    if (call.checkAtOpen) {
      if ((await repository.#check(true)) === null) throw call.notARepository();
      repository.#checkedOnce = true;
    }
    return repository;
  }

  /**
   * Like {@link Repository.open}, for reads: the repository is checked once,
   * and `null` is no repository. Without `readsFiles`, the check skips the
   * nested-repository listing, and the reader refuses `status` and `diff`
   * without `--cached`, which look at the files.
   */
  static async openReader(
    runner: GitRunner,
    folder: string,
    readsFiles = true,
  ): Promise<RepositoryReader | null> {
    return new Repository(runner, await realpath(folder)).reader(readsFiles);
  }

  /** The repository's root folder, as a real path. */
  get top(): string {
    return this.#top;
  }

  /** Its `.git` folder, inside {@link Repository.top}. */
  get gitDir(): string {
    return this.#gitDir;
  }

  /**
   * Checks the repository again, then runs git in it, hardened, with what
   * neutralises its own config.
   *
   * @throws Error when the subcommand isn't one the adapter runs, an option names a file, the folder is no longer a repository, or a check fails
   */
  async run(call: RepositoryCall): Promise<GitResult> {
    checkSubcommand(call.args);
    checkOptions(call.args);
    const calls = this.#calls;
    if (calls === null) {
      // The workspace can change between calls, and a call such as `checkout`
      // or `merge` can change what the next one reads, so every call checks.
      const neutralising = this.#found(await this.#check(true));
      return this.#runChecked(call, neutralising);
    }
    const withListing = !skipsNestedListing(call.args);
    const neutralising = calls.held(withListing) ?? (await this.#checkToHold(calls, withListing));
    return calls.running(call.args, () => this.#runChecked(call, neutralising));
  }

  /**
   * Says the adapter itself wrote into the files or the git files, so the
   * check a port call holds ends and the next command checks again.
   */
  changed(): void {
    this.#calls?.changed();
  }

  async #checkToHold(calls: CallChecks<ConfigEntry[]>, withListing: boolean) {
    const epoch = calls.epoch;
    const neutralising = this.#found(await this.#check(withListing));
    calls.hold(epoch, { result: neutralising, withListing });
    return neutralising;
  }

  #found(neutralising: ConfigEntry[] | null): ConfigEntry[] {
    if (neutralising === null) {
      if (!this.#checkedOnce && this.#notARepository !== null) throw this.#notARepository();
      throw new Error(`The folder ${this.#top} is no longer a git repository.`);
    }
    this.#checkedOnce = true;
    return neutralising;
  }

  /**
   * Checks the repository once, for a series of reads that change nothing.
   * It gives `null` when the folder is no repository.
   *
   * @throws Error as {@link Repository.open} does
   */
  async reader(readsFiles = true): Promise<RepositoryReader | null> {
    const neutralising = await this.#check(readsFiles);
    if (neutralising === null) return null;
    const runChecked = (call: RepositoryCall) => this.#runChecked(call, neutralising, true);
    return new RepositoryReader(runChecked, readsFiles);
  }

  async #runChecked(
    call: RepositoryCall,
    neutralising: readonly ConfigEntry[],
    noOptionalLocks = false,
  ): Promise<GitResult> {
    const gitDir = call.worktree?.gitDir ?? this.#gitDir;
    const workTree = call.worktree?.folder ?? this.#top;
    return this.#runner.run({
      cwd: workTree,
      // Given explicitly, so a link swapped in after the checks can't move the call.
      args: [
        // Global options, so they come before the subcommand and no path can follow them.
        // `--no-optional-locks` stays out of `call.args`, where it would hide the
        // subcommand from `withoutDiffPrograms`.
        ...(noOptionalLocks ? ["--no-optional-locks"] : []),
        `--git-dir=${gitDir}`,
        `--work-tree=${workTree}`,
        ...withoutDiffPrograms(call.args),
      ],
      config: [...neutralising, ...(call.config ?? [])],
      network: call.network === true,
      ...(call.indexFile === undefined ? {} : { indexFile: call.indexFile }),
      ...(call.input === undefined ? {} : { input: call.input }),
    });
  }

  /**
   * Runs git and gives its output.
   *
   * @throws Error with git's own message when it exits with anything but 0
   */
  async output(call: RepositoryCall): Promise<Buffer> {
    const result = await this.run(call);
    if (result.code !== 0) throw gitError(call.args, result);
    return result.stdout;
  }

  /**
   * Checks that the folder is the repository's root with all of its git
   * files inside it, and gives the config that neutralises the programs its
   * own config names; `null` when the folder is no repository. Without
   * `withListing`, it leaves out the nested repositories' filters, which
   * only a command that looks at the files runs.
   */
  async #check(withListing: boolean): Promise<ConfigEntry[] | null> {
    const kind = await kindOf(this.#gitDir);
    if (kind === "missing") return null;
    // A `.git` file or link names git files elsewhere, which `init` would also reach.
    if (kind !== "folder") throw outsideFolder(this.#top);
    const located = await this.#runner.run({
      cwd: this.#top,
      args: [
        "rev-parse",
        "--path-format=absolute",
        "--show-toplevel",
        "--git-dir",
        "--git-common-dir",
        ...gitPathArgs,
      ],
    });
    if (located.code !== 0) return null;
    const lines = located.stdout.toString("utf8").split("\n");
    await checkLocated(this.#top, this.#gitDir, lines.slice(0, 3));
    await checkGitPaths(this.#top, this.#gitDir, [
      ...lines.slice(3, 3 + gitPaths.length),
      ...(await linksInGitFolder(this.#gitDir)),
    ]);
    await checkAlternates(this.#top, join(this.#gitDir, "objects"), 0);
    return neutralisingConfig(this.#runner, this.#top, this.#gitDir, withListing);
  }
}

/**
 * The subcommands a {@link RepositoryReader} runs: the ones that only read.
 * `status` and `diff` are among them because the reader gives them
 * `--no-optional-locks`, which keeps them from refreshing `.git/index`;
 * every call gets `--no-ext-diff --no-textconv` (`withoutDiffPrograms`).
 */
const readSubcommands = new Set([
  "cat-file",
  "diff",
  "for-each-ref",
  "log",
  "ls-tree",
  "rev-parse",
  "show-ref",
  "status",
]);

/**
 * A repository checked once, for reads. Where {@link Repository.run} checks
 * before every call because a call such as `checkout` can change what the
 * next one reads, nothing a reader runs changes the folder or the git files,
 * so the check at its start holds for all of its calls. It refuses any
 * subcommand that isn't in {@link readSubcommands}, and, when its check
 * skipped the nested-repository listing, any that looks at the files. Every
 * call keeps the config that neutralises the repository's programs and the
 * explicit git dir and work tree. Make a new one for each read.
 */
export class RepositoryReader implements GitCalls {
  readonly #runChecked: (call: RepositoryCall) => Promise<GitResult>;
  readonly #readsFiles: boolean;

  constructor(runChecked: (call: RepositoryCall) => Promise<GitResult>, readsFiles = true) {
    this.#runChecked = runChecked;
    this.#readsFiles = readsFiles;
  }

  /**
   * @throws Error when the subcommand isn't a read, or an option names a file
   */
  async run(call: RepositoryCall): Promise<GitResult> {
    checkSubcommand(call.args);
    checkOptions(call.args);
    const [subcommand = ""] = call.args;
    if (!readSubcommands.has(subcommand)) {
      throw new Error(`A read in the git adapter doesn't run git ${subcommand}.`);
    }
    if (!this.#readsFiles && !skipsNestedListing(call.args)) {
      throw new Error(
        `This read in the git adapter doesn't look at the files: no git ${subcommand}.`,
      );
    }
    // The runner adds `--no-optional-locks` to every read.
    return this.#runChecked(call);
  }

  async output(call: RepositoryCall): Promise<Buffer> {
    const result = await this.run(call);
    if (result.code !== 0) throw gitError(call.args, result);
    return result.stdout;
  }
}

/** An error for a git call that failed, with git's message. */
export function gitError(args: readonly string[], result: GitResult): Error {
  const message = result.stderr.trim().replace(/^(?:fatal|error): /u, "");
  return new Error(`git ${args[0] ?? ""} failed: ${message || `exit code ${result.code}`}`);
}

async function kindOf(path: string): Promise<"missing" | "folder" | "other"> {
  try {
    return (await lstat(path)).isDirectory() ? "folder" : "other";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw error;
  }
}

/**
 * Lists the repository's config, refuses what no override reaches, and
 * gives the config that blanks its filters (and those of every repository
 * nested in it as a gitlink, which `add`, `status` and `diff` look into)
 * and neutralises the other programs it names.
 */
async function neutralisingConfig(
  runner: GitRunner,
  top: string,
  gitDir: string,
  withListing: boolean,
): Promise<ConfigEntry[]> {
  const entries = await listConfig(runner, top, gitDir);
  checkRefusedKeys(entries);
  const filters = new Set(filterNames(entries));
  if (withListing) {
    const nesting = { top, visited: new Set([top]) };
    await addNestedFilterNames(runner, top, [`--git-dir=${gitDir}`], filters, nesting);
  }
  return [...blankFilters([...filters]), ...neutralisePrograms(entries)];
}

async function listConfig(
  runner: GitRunner,
  cwd: string,
  gitDir?: string,
): Promise<ListedConfig[]> {
  const args = ["config", "--list", "--show-scope", "--includes", "-z"];
  const located = gitDir === undefined ? [] : [`--git-dir=${gitDir}`];
  const result = await runner.run({ cwd, args: [...located, ...args] });
  if (result.code !== 0) throw gitError(args, result);
  const entries = parseConfigListing(result.stdout);
  if (!hasCommandEntry(entries, "core.hooksPath")) {
    throw new Error("This git is too old for Halonic: it needs git 2.31 or later.");
  }
  return entries;
}

/** The workspace's top folder, and the nested repositories already read. */
interface Nesting {
  top: string;
  visited: Set<string>;
}

/**
 * Adds the filter names of every repository nested in the one at `folder`,
 * as a gitlink or not yet tracked, and of those nested in them in turn. Each nested
 * repository's git files must be inside the workspace too.
 */
async function addNestedFilterNames(
  runner: GitRunner,
  folder: string,
  located: readonly string[],
  names: Set<string>,
  nesting: Nesting,
): Promise<void> {
  const listing = await runner.run({ cwd: folder, args: [...located, ...nestedListingArgs] });
  if (listing.code !== 0) throw gitError(nestedListingArgs, listing);
  for (const path of nestedRepositories(listing.stdout)) {
    const nested = join(folder, path);
    // A submodule that isn't checked out has no `.git`, and git doesn't look into it.
    if ((await kindOf(join(nested, ".git"))) === "missing") continue;
    const real = await realpath(nested);
    if (nesting.visited.has(real)) continue;
    nesting.visited.add(real);
    const located = await runner.run({ cwd: real, args: locateNestedArgs });
    if (located.code !== 0) throw gitError(locateNestedArgs, located);
    await checkNestedInside(nesting.top, real, located.stdout.toString("utf8"));
    for (const entry of filterNames(await listConfig(runner, real))) names.add(entry);
    await addNestedFilterNames(runner, real, [], names, nesting);
  }
}

/**
 * What lists, in one git call, the index with each entry's mode, and the
 * untracked files that aren't ignored. `add --all` adds an untracked nested
 * repository as a gitlink too, and reads its git folder to do so, so both
 * count. `-t` puts a tag before each entry, `? ` before an untracked one,
 * so no path can pass for the other kind.
 */
const nestedListingArgs = ["ls-files", "--stage", "--others", "--exclude-standard", "-t", "-z"];

/**
 * The nested repositories in the output of {@link nestedListingArgs}: each
 * gitlink in the index (mode 160000), and each untracked folder git lists
 * as a repository, with a `/` at the end.
 */
export function nestedRepositories(listing: Buffer): string[] {
  const paths: string[] = [];
  for (const entry of listing.toString("utf8").split("\0")) {
    // A one-letter tag and a space: `?` for an untracked entry, another letter for one in the index.
    const tag = entry.slice(0, 2);
    const rest = entry.slice(2);
    if (tag === "? ") {
      if (rest.endsWith("/")) paths.push(rest.slice(0, -1));
      continue;
    }
    if (!rest.startsWith("160000 ")) continue;
    const tab = rest.indexOf("\t");
    if (tab !== -1) paths.push(rest.slice(tab + 1));
  }
  return paths;
}
