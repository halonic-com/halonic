# @halonicjs/adapter-git

The `Vcs` port on the real `git` program, for one workspace folder. git always runs hardened, whether the workspace is trusted or not (plan section 11).

- **Layer:** adapters
- **Owner:** tomas
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-git`

## Example

```ts
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";

const runner = await GitRunner.create();
const vcs = new GitVcs("/srv/workspaces/acme", {
  runner,
  author: { name: "Acme Studio", email: "studio@acme.example" },
});
console.log(await vcs.status());
```

git reads no user config, so the caller gives the commit author.

## How git is hardened

`GitRunner` starts git by its absolute path (`findGit` looks only in the absolute folders of the `PATH`, and only for `git.exe` on Windows), with an argument array and no shell. Every call:

- points `core.hooksPath` at a folder that must stay empty, and gives the rest of the port's hardening config (`core.fsmonitor`, signing, submodules, maintenance, bundles, credential helpers, commit templates) in the environment through `GIT_CONFIG_COUNT`;
- removes every inherited `GIT_*` variable and reads no system or user config (`GIT_CONFIG_NOSYSTEM`, `GIT_CONFIG_GLOBAL=/dev/null`);
- allows only `https` and `ssh` remotes, with `ssh` itself and no password prompt;
- runs only in an absolute folder and never looks for a repository above it (`GIT_CEILING_DIRECTORIES`, which git ignores when relative), and finds programs only in the absolute folders of the `PATH`;
- stops git, and every program it started, past its time or output limit.

Before each call in a repository, the adapter checks that the folder is the repository's root, with all of its git files and alternate objects inside the folder. It then lists the repository's config, blanks the filters it and its nested repositories define, sends merge drivers to a conflict and ssh and signing programs back to git's defaults, and gives `diff`, `log`, `show` and `whatchanged` `--no-ext-diff --no-textconv`. It refuses a repository whose own config sets `branch.<name>.mergeOptions`, `include.path` or `includeIf.<condition>.path`. `pull` and `push` name `git-upload-pack` and `git-receive-pack` themselves, which beats `remote.<name>.uploadpack` and `remote.<name>.receivepack`.

## Versions

A version is a full commit id (port v2). `snapshot` commits the public files on disk through a copy of the index in `.git`, so the person's branch, index and working tree don't change and the commit is on no branch; `.env` and the other private entries stay out even when `.gitignore` lets them in. `readAt` and `listAt` read a commit's regular files with `ls-tree` and `cat-file blob`, never the working tree, and run no filter. `rename` uses `git mv` for what the repository tracks, so the history follows the file.

The desktop's `git-guard` crate does the same in Rust.

## Not yet

- **Pushing to a remote that needs a password.** No credential helper runs, the user's included. Halonic's own helper comes with the keychain work.
- **The repository's own config, through `GitRunner` alone.** The runner on its own doesn't stop programs the repository's config or `.gitattributes` names, such as a filter or an external diff; only the repository checks do, and `GitVcs` runs every call through them. On a workspace you don't trust, use `GitVcs`, not `GitRunner` directly.
- **Worktrees and patches.** The rest of port v2 (`addWorktree`, `diffBetween`, `applyPatch` and the others in the ADR) comes when the port adds them.
