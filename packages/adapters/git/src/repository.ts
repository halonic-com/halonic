import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
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

/** git reads alternates five deep; so does the check. */
const maxAlternateDepth = 5;

/** A call in a checked repository. */
export interface RepositoryCall {
  args: readonly string[];
  /** Config for this call only, after the rest. */
  config?: readonly ConfigEntry[];
  /** Whether it reaches a remote. */
  network?: boolean;
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
  readonly #config: readonly ConfigEntry[];

  private constructor(runner: GitRunner, top: string, gitDir: string, config: ConfigEntry[]) {
    this.#runner = runner;
    this.#top = top;
    this.#gitDir = gitDir;
    this.#config = config;
  }

  /**
   * The repository whose root is `folder`, or `null` when the folder isn't
   * one: no repository at all, or a folder inside another one.
   *
   * @throws Error when the repository keeps files outside the folder, or its config can't be read or sets a refused key
   */
  static async open(runner: GitRunner, folder: string): Promise<Repository | null> {
    const top = await realpath(folder);
    const gitDir = join(top, ".git");
    const kind = await kindOf(gitDir);
    if (kind === "missing") return null;
    // A `.git` file or link names git files elsewhere, which `init` would also reach.
    if (kind !== "folder") throw outsideFolder(top);
    const located = await runner.run({
      cwd: top,
      args: [
        "rev-parse",
        "--path-format=absolute",
        "--show-toplevel",
        "--git-dir",
        "--git-common-dir",
      ],
    });
    if (located.code !== 0) return null;
    await checkLocated(top, gitDir, located.stdout.toString("utf8"));
    await checkAlternates(top, join(gitDir, "objects"), 0);
    const config = await neutralisingConfig(runner, top, gitDir);
    return new Repository(runner, top, gitDir, config);
  }

  /** The repository's root folder, as a real path. */
  get top(): string {
    return this.#top;
  }

  /** Runs git in the repository, hardened, with what neutralises its own config. */
  run(call: RepositoryCall): Promise<GitResult> {
    return this.#runner.run({
      cwd: this.#top,
      // Given explicitly, so a link swapped in after the checks can't move the call.
      args: [`--git-dir=${this.#gitDir}`, `--work-tree=${this.#top}`, ...call.args],
      config: [...this.#config, ...(call.config ?? [])],
      network: call.network === true,
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

function outsideFolder(top: string): Error {
  return new Error(
    `The repository at ${top} keeps its git files outside the folder, which Halonic doesn't allow.`,
  );
}

/** The folder must be the top, with its own `.git` folder as both git folders, not a linked worktree or a `gitdir:` file. */
async function checkLocated(top: string, gitDir: string, stdout: string): Promise<void> {
  const [shownTop, shownGitDir, shownCommonDir] = stdout.split("\n").map((line) => line.trimEnd());
  for (const [shown, expected] of [
    [shownTop, top],
    [shownGitDir, gitDir],
    [shownCommonDir, gitDir],
  ] as const) {
    if (shown === undefined || shown === "" || (await realpath(shown)) !== expected) {
      throw outsideFolder(top);
    }
  }
}

/** Every folder an `objects/info/alternates` file names must be inside the workspace, and so must theirs. */
async function checkAlternates(top: string, objects: string, depth: number): Promise<void> {
  let contents: string;
  try {
    contents = await readFile(join(objects, "info", "alternates"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  for (const line of contents.split("\n").map((each) => each.trimEnd())) {
    if (line === "" || line.startsWith("#")) continue;
    const alternate = await realpath(resolve(objects, line));
    if (!isInside(top, alternate)) {
      throw new Error(
        `The repository at ${top} reads objects from outside the folder, which Halonic doesn't allow.`,
      );
    }
    if (depth < maxAlternateDepth) await checkAlternates(top, alternate, depth + 1);
  }
}

function isInside(folder: string, path: string): boolean {
  const fromFolder = relative(folder, path);
  return fromFolder === "" || (!fromFolder.startsWith("..") && !isAbsolute(fromFolder));
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
  await addNestedFilterNames(runner, top, [`--git-dir=${gitDir}`], filters, new Set([top]));
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
    throw new Error("This git is too old for Halonic: it needs git 2.32 or later.");
  }
  return entries;
}

/**
 * Adds the filter names of every repository nested in the one at `folder`
 * as a gitlink, and of those nested in them in turn.
 */
async function addNestedFilterNames(
  runner: GitRunner,
  folder: string,
  located: readonly string[],
  names: Set<string>,
  visited: Set<string>,
): Promise<void> {
  const index = await runner.run({ cwd: folder, args: [...located, "ls-files", "--stage", "-z"] });
  if (index.code !== 0) throw gitError(["ls-files"], index);
  for (const path of gitlinks(index.stdout)) {
    const nested = join(folder, path);
    // A submodule that isn't checked out has no `.git`, and git doesn't look into it.
    if ((await kindOf(join(nested, ".git"))) === "missing") continue;
    const real = await realpath(nested);
    if (visited.has(real)) continue;
    visited.add(real);
    for (const entry of filterNames(await listConfig(runner, real))) names.add(entry);
    await addNestedFilterNames(runner, real, [], names, visited);
  }
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
