import { lstat, realpath } from "node:fs/promises";
import { join } from "node:path";
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

/**
 * The repository at one workspace folder, checked before every call: the
 * folder is its root, all of its files are inside the folder, and the
 * programs its own config names are neutralised.
 */
export class Repository {
  readonly #runner: GitRunner;
  readonly #top: string;
  readonly #gitDir: string;

  private constructor(runner: GitRunner, top: string) {
    this.#runner = runner;
    this.#top = top;
    this.#gitDir = join(top, ".git");
  }

  /**
   * The repository whose root is `folder`, or `null` when the folder isn't
   * one: no repository at all, or a folder inside another one.
   *
   * @throws Error when the repository keeps files outside the folder, or its config can't be read or sets a refused key
   */
  static async open(runner: GitRunner, folder: string): Promise<Repository | null> {
    const repository = new Repository(runner, await realpath(folder));
    return (await repository.#check()) === null ? null : repository;
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
    // The workspace can change between calls, and a call such as `checkout`
    // or `merge` can change what the next one reads, so every call checks.
    const neutralising = await this.#check();
    if (neutralising === null) {
      throw new Error(`The folder ${this.#top} is no longer a git repository.`);
    }
    const gitDir = call.worktree?.gitDir ?? this.#gitDir;
    const workTree = call.worktree?.folder ?? this.#top;
    return this.#runner.run({
      cwd: workTree,
      // Given explicitly, so a link swapped in after the checks can't move the call.
      args: [`--git-dir=${gitDir}`, `--work-tree=${workTree}`, ...withoutDiffPrograms(call.args)],
      config: [...neutralising, ...(call.config ?? [])],
      network: call.network === true,
      ...(call.indexFile === undefined ? {} : { indexFile: call.indexFile }),
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
   * own config names; `null` when the folder is no repository.
   */
  async #check(): Promise<ConfigEntry[] | null> {
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
    return neutralisingConfig(this.#runner, this.#top, this.#gitDir);
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
): Promise<ConfigEntry[]> {
  const entries = await listConfig(runner, top, gitDir);
  checkRefusedKeys(entries);
  const filters = new Set(filterNames(entries));
  const nesting = { top, visited: new Set([top]) };
  await addNestedFilterNames(runner, top, [`--git-dir=${gitDir}`], filters, nesting);
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
  const index = await runner.run({ cwd: folder, args: [...located, "ls-files", "--stage", "-z"] });
  if (index.code !== 0) throw gitError(["ls-files"], index);
  // `add --all` adds an untracked one as a gitlink too, and reads its git folder to do so.
  const untracked = await runner.run({ cwd: folder, args: [...located, ...untrackedArgs] });
  if (untracked.code !== 0) throw gitError(["ls-files"], untracked);
  for (const path of [...gitlinks(index.stdout), ...untrackedRepositories(untracked.stdout)]) {
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

/** What lists the untracked files that aren't ignored, and the untracked nested repositories. */
const untrackedArgs = ["ls-files", "--others", "--exclude-standard", "-z"];

/** The untracked nested repositories in the output of {@link untrackedArgs}: git lists each as a folder, with a `/` at the end. */
function untrackedRepositories(listing: Buffer): string[] {
  return listing
    .toString("utf8")
    .split("\0")
    .filter((path) => path.endsWith("/"))
    .map((path) => path.slice(0, -1));
}

/** The paths of the gitlinks in the output of `ls-files --stage -z`: mode 160000. */
export function gitlinks(listing: Buffer): string[] {
  const paths: string[] = [];
  for (const entry of listing.toString("utf8").split("\0")) {
    if (!entry.startsWith("160000 ")) continue;
    const tab = entry.indexOf("\t");
    if (tab !== -1) paths.push(entry.slice(tab + 1));
  }
  return paths;
}
