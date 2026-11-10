import type { DefinitionStore, Vcs, VcsWorktree } from "@halonicjs/ports";
import type { DefinitionFiles } from "./definition-store.ts";
import { privateDefinitionPaths, unsafeDefinitionPaths } from "./definition-store.ts";

/**
 * One workspace folder under test: its version control, and its files as an
 * editor changes them. Writing through `files` changes the working tree, the
 * same way the Studio's editors do. `files.location` is the workspace folder,
 * in the same form as the `path` of a worktree `vcs` adds.
 */
export interface VcsHarness {
  vcs: Vcs;
  files: DefinitionStore;
  /**
   * The files of a worktree `vcs` added, as an agent or the assistant
   * working there changes them.
   */
  worktreeFiles(worktree: VcsWorktree): DefinitionStore;
  /**
   * Writes a private entry, such as `.env`, into a worktree's folder, the way
   * a program running there could. `worktreeFiles` refuses private paths, as
   * every store does, so the cases need this to check they never come back.
   */
  writePrivate(worktree: VcsWorktree, path: string, content: string): Promise<void>;
  /**
   * Writes a private entry, such as `.env`, into the workspace folder and
   * commits it on the current branch, as a repository cloned from someone
   * who committed their `.env` holds it. The port refuses to stage one, so
   * the cases need this to check HEAD tracking it changes nothing.
   */
  commitPrivate(path: string, content: string): Promise<void>;
  /** A private entry's content in the workspace folder; `null` when it isn't there. */
  readPrivate(path: string): Promise<string | null>;
  /**
   * Full ids, in the repository's object format, of objects in `commit`
   * that aren't commits: for git, its tree and a file's blob. An adapter
   * whose versions are only commits, such as the memory one, gives none.
   */
  nonCommitIds(commit: string): Promise<string[]>;
  /**
   * Plants code that git would run on its own in this folder's repository.
   * An adapter that drives git must give it for every repository and clone,
   * so the hardened cases can check none of it ever runs.
   */
  plant?: PlantGitCode;
}

/**
 * Code planted in a repository the way an attacker who can write to the
 * workspace folder would plant it. Each planted program, if it ever runs,
 * leaves a mark that `ran` sees.
 */
export interface PlantGitCode {
  /**
   * An executable hook called `name` (such as `pre-commit`) in the
   * repository's own hooks folder, and a copy in a folder that a
   * `core.hooksPath` in the repository's own config points to.
   */
  hook(name: string): Promise<void>;
  /**
   * Sets `key` in the repository's own config to `value`, or, without one,
   * to a program that leaves the mark, in the form git takes for that key:
   * a path for `core.fsmonitor`, `!…` for `credential.helper`, an `ext::`
   * URL for `remote.<name>.url`, and a shell command otherwise.
   */
  config(key: string, value?: string): Promise<void>;
  /** Adds `line`, such as `* filter=planted`, to the repository's own `.git/info/attributes`. */
  attributes(line: string): Promise<void>;
  /**
   * Creates a repository inside the workspace folder with every hook in
   * {@link plantedHooks} planted in it, and points remote `origin` at it by
   * its local path. git runs a local remote's own hooks and config on push
   * and pull, out of reach of anything the adapter sets, so the port refuses
   * local remotes.
   */
  localRemote(): Promise<void>;
  /**
   * Rewrites the `.git` file in `worktree`'s folder to point at a repository
   * planted outside it, whose config sets `core.fsmonitor` to a program that
   * leaves the mark (HAL-3188). Whatever runs in a worktree can do this.
   */
  worktreeGitFile(worktree: VcsWorktree): Promise<void>;
  /** Whether any planted code has run. */
  ran(): Promise<boolean>;
}

/** Creates the folders the {@link Vcs} suite needs. Every folder is new and shares nothing with the others. */
export interface MakeVcs {
  /**
   * A folder holding `files` that is not a repository. Where the adapter
   * keeps runtime data, the folder also holds a file in `.studio`, which
   * `init` must ignore.
   */
  folder(files: DefinitionFiles): Promise<VcsHarness>;
  /**
   * A folder holding `files` inside a repository that is not the folder:
   * the repository's root is the folder's parent, and has `files` committed
   * in the folder. An adapter with no parent folders, such as the memory
   * one, gives a folder that is not a repository.
   */
  nested(files: DefinitionFiles): Promise<VcsHarness>;
  /**
   * A repository on branch `main`, with `files` in one commit and no remote.
   * A private entry in `files`, such as `.env`, is in the folder, untracked
   * and not ignored.
   */
  repo(files: DefinitionFiles): Promise<VcsHarness>;
  /**
   * Two clones of one new remote called `origin`. Each is on `main`, tracks
   * `origin/main` and has `files` in one commit, the same commit as the remote.
   * A git adapter refuses local remotes (see the `Vcs` port), so its harness
   * serves the remote over `https` or `ssh`, for example with `git http-backend`.
   */
  clones(files: DefinitionFiles): Promise<[VcsHarness, VcsHarness]>;
  /**
   * Whether the adapter drives git. Required, so no adapter can leave the
   * hardened cases out by accident: when `true`, every repository and clone
   * must come with `plant`; when `false` (an adapter such as the memory one,
   * which runs no programs at all), the hardened cases are skipped.
   */
  drivesGit: boolean;
}

/**
 * Paths that reach the repository's own files: a `.git` segment in any case,
 * as Windows reads it with trailing dots or spaces, and as its short name.
 * Writing `.git/config` or a hook would run code on the next git command.
 */
export const gitInternalPaths: readonly string[] = [
  ".git",
  ".git/config",
  ".git/hooks/pre-commit",
  ".GIT/config",
  ".Git/HEAD",
  "hubs/.git/config",
  ".git./config",
  ".git /config",
  ".git . /config",
  "git~1/config",
  "GIT~1/hooks/post-checkout",
];

/**
 * Every path each `Vcs` method must refuse with a `RangeError` before
 * anything runs: the ones a `DefinitionSource` refuses, unsafe or private,
 * and more ways to name the repository's own files.
 */
export const unsafeVcsPaths: readonly string[] = [
  ...unsafeDefinitionPaths,
  ...privateDefinitionPaths,
  ...gitInternalPaths,
];

/** Hooks git runs on its own during the commands the `Vcs` port uses. */
export const plantedHooks: readonly string[] = [
  "pre-commit",
  "prepare-commit-msg",
  "commit-msg",
  "post-commit",
  "post-checkout",
  "post-index-change",
  "reference-transaction",
  "pre-push",
  "post-merge",
  "pre-auto-gc",
];

/**
 * Branch names `createBranch` and `checkout` must refuse with a `RangeError`:
 * git options, among them the prefixes git expands (`--upload-pac=` for
 * `--upload-pack=`), and names `git check-ref-format --branch` refuses.
 */
export const invalidBranchNames: readonly string[] = [
  // Read as an option if it reached git.
  "-",
  "-b",
  "-f",
  "--force",
  "--orphan",
  "--upload-pack=touch pwned",
  "--upload-pac=touch pwned",
  "--upl=touch pwned",
  "-ccore.sshCommand=touch pwned",
  "--detach",
  // Refused by git's ref name rules.
  "",
  "HEAD",
  "@",
  "a..b",
  "a b",
  "a~1",
  "a^",
  "a:b",
  "a?",
  "a*",
  "a[b",
  "a\\b",
  "a\u0000b",
  "a\nb",
  "a\u007fb",
  "a@{1}",
  "@{-1}",
  ".hidden",
  "feature/.hidden",
  "a.lock",
  "feature/a.lock/b",
  "a/",
  "/a",
  "a//b",
  "a.",
];

/** Branch names that look odd but git accepts; `createBranch` must not refuse them. */
export const validBranchNames: readonly string[] = [
  "feature/x-1",
  "fix_2",
  "release-1.2",
  "a.b",
  "user@host",
  "UPPER",
  "x-",
];

/**
 * File names that are git options. A path is a file name, never an option,
 * so each must touch only the file of that name. `--output=` would make
 * `git diff` write a file; `-f` would let `git clean` delete everything.
 */
export const optionLikePaths: readonly string[] = [
  "--all",
  "-A",
  "-f",
  "--force",
  "-x",
  "--output=written.txt",
  "--upload-pac=x",
];

/**
 * File names that are git pathspec patterns. A path is a file name, never a
 * pattern, so each must touch only the file of that name: as a pattern,
 * `*.yaml` would discard every `.yaml` file.
 */
export const patternLikePaths: readonly string[] = ["*.yaml", "?.yaml", "[ab].yaml"];

/** Commit messages that are git options; each must be committed as the message. */
export const optionLikeMessages: readonly string[] = [
  "--amend",
  "--allow-empty",
  "--no-verify",
  "-m",
  "--author=Mallory <mallory@example.com>",
  "-F/etc/passwd",
];
