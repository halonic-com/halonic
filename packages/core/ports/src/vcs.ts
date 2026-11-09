/** Version of the {@link Vcs} port. A breaking change bumps it and comes with an ADR. */
export const vcsVersion = 1;

/** How a file differs from the last commit. */
export type VcsFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted";

/** One changed file. */
export interface VcsChange {
  /** Path relative to the workspace root, "/" separated. */
  path: string;
  /** How it differs from the last commit. */
  status: VcsFileStatus;
  /** In the index (will be committed) or only in the working tree. */
  staged: boolean;
  /** Renames: the old path. */
  from?: string;
}

/** The state of the workspace folder's repository. */
export interface VcsStatus {
  /** Whether the folder is a repository at all; when not, the other fields are empty. */
  isRepo: boolean;
  /** Current branch; null when detached or not a repo. */
  branch: string | null;
  /** The branch it tracks, such as "origin/main", or `null` when none. */
  upstream: string | null;
  /** Commits on the branch that the upstream doesn't have. */
  ahead: number;
  /** Commits on the upstream that the branch doesn't have. */
  behind: number;
  /** Every changed file, staged or not. */
  changes: VcsChange[];
}

/** One commit in the history. */
export interface VcsCommit {
  /** The full commit hash. */
  hash: string;
  /** The author's name. */
  author: string;
  /** ISO date. */
  date: string;
  /** The first line of the commit message. */
  message: string;
}

/**
 * Version control of one workspace folder (git today). Paths are relative to that folder.
 *
 * The folder is a repository only when it is a repository's root. A folder
 * inside another repository is not one: its status says so, and `init`
 * makes it a repository of its own. So no method ever reads or changes a
 * file outside the folder, such as a parent repository's staged changes or
 * the files a checkout there would rewrite.
 *
 * **Nothing a caller passes is ever read as an option or as the
 * repository's own files.** The old desktop app kept a blocklist of git
 * options, which a unique prefix such as `--upload-pac=` could get around.
 * So every adapter, before anything runs:
 *
 * - refuses with a `RangeError` every **path the `DefinitionSource` port
 *   refuses**: an unsafe one (absolute, a `.`, `..` or empty segment, a
 *   backslash or NUL) and a private one, matched the same way (`.git`,
 *   `.studio`, `.env`, `.envrc` and `.env.*` in any case, with trailing dots
 *   or spaces or the code points HFS+ ignores, and any segment with a `:`
 *   or an 8.3 short name such as `GIT~1`);
 * - treats **every path as a literal file name**: never an option (one that
 *   starts with `-`) and never a pattern (`*`, `?`, `[` or `:(…)`), so a git
 *   adapter passes paths after `--` with `--literal-pathspecs` (or
 *   `GIT_LITERAL_PATHSPECS=1`), or `discard(["*.yaml"])` would wipe every
 *   `.yaml` file;
 * - refuses with a `RangeError` a **branch name** that starts with `-`, that
 *   `git check-ref-format --branch` refuses, the name `HEAD`, and `@` or any
 *   name with `@{`, which git expands (`@{-1}` is the previous branch);
 * - in a git adapter, refuses a path that goes through a symbolic link, such
 *   as `link/config` with `link -> .git` or a link out of the folder, which
 *   the path rules above can't see;
 * - commits a message as the message, whatever it starts with.
 *
 * Remotes and upstreams come from the repository, never from a caller.
 *
 * **An adapter that drives git always runs it hardened**, whether the
 * workspace is trusted or not (plan section 11). Anyone who can write the
 * workspace folder can write `.git/config` and `.git/info/attributes`, so
 * no program named there ever runs. Every call:
 *
 * - points `core.hooksPath` at an empty folder and passes
 *   `-c core.fsmonitor=false` (hooks and fsmonitor);
 * - blanks the `clean`, `smudge` and `process` commands of every
 *   `filter.<name>` driver the repository's config has (filters);
 * - diffs and logs with `--no-ext-diff --no-textconv` (`diff.external`,
 *   `diff.<name>.command` and `diff.<name>.textconv`);
 * - passes `-c commit.gpgSign=false -c push.gpgSign=false
 *   -c log.showSignature=false` (`gpg.program` and the other signing
 *   programs);
 * - fetches and pushes with `--upload-pack=git-upload-pack` and
 *   `--receive-pack=git-receive-pack` (`remote.<name>.uploadpack` and
 *   `receivepack`), `-c credential.helper=` followed only by Halonic's own
 *   helper, if any (`credential.helper`), `GIT_SSH_COMMAND=ssh`
 *   (`core.sshCommand`), `GIT_ASKPASS` set (`core.askPass`) and
 *   `GIT_ALLOW_PROTOCOL=https:ssh:file` (`protocol.*.allow`, so no `ext::`
 *   URL runs a command);
 * - starts from an environment with every inherited `GIT_*` variable
 *   removed (such as `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` and
 *   `GIT_CONFIG_PARAMETERS`), and sets `GIT_TERMINAL_PROMPT=0`,
 *   `GIT_EDITOR=true` and `GIT_PAGER=cat`, so nothing waits on a prompt;
 * - never sets `safe.directory=*`.
 *
 * Out of scope, because no port method reaches them: merge drivers
 * (`pull` is fast-forward only), `submodule.*.update` (no submodule
 * command), and the remote repository's own config, such as
 * `core.alternateRefsCommand` (it isn't the workspace).
 */
export interface Vcs {
  /** The branch, its upstream and the changed files. */
  status(): Promise<VcsStatus>;
  /** Unified diff of one file: staged = index vs HEAD, otherwise working tree vs index. Empty when they are the same. */
  diff(path: string, staged: boolean): Promise<string>;
  /** Adds the files' changes to the index. */
  stage(paths: string[]): Promise<void>;
  /** Takes the files' changes out of the index, leaving the working tree as it is. */
  unstage(paths: string[]): Promise<void>;
  /** Throw away working-tree changes: tracked files go back to the index, untracked files are deleted. */
  discard(paths: string[]): Promise<void>;
  /**
   * Commits what is staged; returns the new commit hash.
   *
   * @throws when nothing is staged, or the message is empty
   */
  commit(message: string): Promise<string>;
  /**
   * At most `limit` commits on the current branch, newest first.
   *
   * @throws RangeError when `limit` isn't a whole number of at least 1
   */
  log(limit: number): Promise<VcsCommit[]>;
  /** The local branch names; a branch with no commits yet isn't listed. */
  branches(): Promise<string[]>;
  /**
   * Switches to a local branch. Refuses, and changes nothing, when that would
   * overwrite an untracked file, or while a tracked file has changes: an
   * adapter may refuse any such change, as the memory one does, though git
   * refuses only those the branch would touch.
   *
   * A name is only ever a branch, never a path: `git checkout a.yaml` with no
   * such branch would throw away the changes to `a.yaml`, so a git adapter
   * uses `git switch` or `git checkout <branch> --`.
   *
   * @throws when there is no such branch, or the switch would lose changes
   */
  checkout(branch: string): Promise<void>;
  /**
   * Creates a branch from the current commit and switches to it.
   *
   * @throws when a branch of that name already exists, or it would sit next
   *   to `x` as `x/y` or the other way round, which git refuses
   */
  createBranch(name: string): Promise<void>;
  /** Make the folder a repository, ignoring `.studio`, the folder Halonic keeps its runtime data in. */
  init(): Promise<void>;
  /** The remote names, such as "origin". */
  remotes(): Promise<string[]>;
  /**
   * Brings in the upstream's commits, fast-forward only. Like `checkout`, it
   * refuses to overwrite an untracked file or to switch over changes.
   *
   * @throws when the branch and its upstream have both moved on; nothing is merged
   */
  pull(): Promise<void>;
  /**
   * Sends the branch's commits to its upstream, or to the first remote (which
   * becomes the upstream) when it has none.
   *
   * @throws when the remote has commits the branch doesn't (no force push), or there is no remote
   */
  push(): Promise<void>;
}
