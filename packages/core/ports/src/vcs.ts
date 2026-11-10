/** Version of the {@link Vcs} port. A breaking change bumps it and comes with an ADR. */
export const vcsVersion = 2;

/** A full commit id: 40 (SHA-1) or 64 (SHA-256) lowercase hex characters. */
const commitIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

/**
 * Refuses a version that isn't a full commit id, the only kind of version a
 * {@link Vcs} method takes. A branch name, `HEAD`, `@{-1}` or a short id would
 * be resolved by git against whatever the repository holds at that moment,
 * and a name starting with `-` would be read as an option; a caller only ever
 * holds ids that `snapshot`, `commit` or `log` gave it.
 *
 * @throws RangeError naming the version
 */
export function checkCommitId(version: string): void {
  if (!commitIdPattern.test(version)) {
    throw new RangeError(
      `Invalid version ${JSON.stringify(version)}: give a full commit id (40 or 64 lowercase hex characters).`,
    );
  }
}

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
 *   `filter.<name>` driver the repository's config has, and the config of
 *   every repository nested in it as a gitlink, which `add`, `status` and
 *   `diff` look into (filters);
 * - diffs and logs with `--no-ext-diff --no-textconv` (`diff.external`,
 *   `diff.<name>.command` and `diff.<name>.textconv`), and with
 *   `-c diff.submodule=short`, so no submodule's own diff programs run;
 * - commits with the message it is given (`commit.template`, which can name
 *   any file whose text would otherwise become the message);
 * - passes `-c core.alternateRefsCommand=true`, since `pull` would run it
 *   locally for every alternate, and blanks `fetch.bundleURI`, which would
 *   read objects and refs from any local file;
 * - passes `-c maintenance.auto=false -c gc.auto=0`, so no automatic `gc`
 *   runs `gc.recentObjectsHook`;
 * - passes `-c commit.gpgSign=false -c push.gpgSign=false
 *   -c log.showSignature=false` (`gpg.program`, `gpg.ssh.defaultKeyCommand`
 *   and the other signing programs);
 * - passes `-c submodule.recurse=false -c fetch.recurseSubmodules=false`, so
 *   git never fetches, checks out or pushes inside a submodule, where that
 *   submodule's own config applies;
 * - fetches and pushes with `--upload-pack=git-upload-pack` and
 *   `--receive-pack=git-receive-pack` (`remote.<name>.uploadpack` and
 *   `receivepack`), `-c credential.helper=` followed only by Halonic's own
 *   helper, if any (`credential.helper`), `GIT_SSH_COMMAND=ssh`
 *   (`core.sshCommand`), `GIT_ASKPASS` set (`core.askPass`) and
 *   `GIT_ALLOW_PROTOCOL=https:ssh` (`protocol.*.allow`, so no `ext::` URL
 *   runs a command). No `file`: a local remote such as `./planted.git` runs
 *   its own hooks and config on push and pull, out of reach of every
 *   setting here, so local remotes are refused;
 * - starts from an environment with every inherited `GIT_*` variable
 *   removed (such as `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` and
 *   `GIT_CONFIG_PARAMETERS`), and sets `GIT_TERMINAL_PROMPT=0`,
 *   `GIT_EDITOR=true` and `GIT_PAGER=cat`, so nothing waits on a prompt;
 * - never sets `safe.directory=*`.
 *
 * Out of scope, because no port method reaches them: merge drivers
 * (`pull` is fast-forward only), `submodule.*.update` (no submodule
 * command), and a remote server's own config, which runs on another
 * machine. Where a
 * workspace's config would make a program run, the adapter neutralises it
 * as above rather than refusing the workspace, so a cloned repository that
 * names one still works.
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
  /**
   * Commits the workspace's files as they are on disk now, new files
   * included, and returns the commit's id. Files the repository ignores and
   * private entries (see `DefinitionSource`) are left out, so a `.env` with
   * a key never reaches a worktree. The commit's parent is the current
   * commit, if any. Neither HEAD, the branch, the index nor the working tree
   * changes: the commit is on no branch.
   *
   * @throws when the folder isn't a repository
   */
  snapshot(): Promise<string>;
  /**
   * A file's text at a commit, or `null` when the commit has no such file.
   * Never reads the working tree or the index.
   *
   * @throws RangeError for a version that isn't a full commit id (see
   *   {@link checkCommitId}) or a path the port refuses
   * @throws when the repository has no such commit: `Unknown version <id>`
   */
  readAt(version: string, path: string): Promise<string | null>;
  /**
   * Every file under `dir` at a commit (the whole workspace without one),
   * recursively, as sorted paths relative to the workspace folder, private
   * entries left out; `null` when the commit has no file under `dir`.
   *
   * @throws as {@link Vcs.readAt}
   */
  listAt(version: string, dir?: string): Promise<string[] | null>;
  /**
   * Moves a file or folder in the working tree and, where the repository
   * tracks it, in the index too (`git mv`), so its history follows it. An
   * untracked file just moves.
   *
   * @throws when `from` doesn't exist or `to` already does; nothing changes
   */
  rename(from: string, to: string): Promise<void>;
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
