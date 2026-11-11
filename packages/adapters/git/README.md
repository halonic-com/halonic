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
  // In the app's data folder, never inside the workspace.
  worktrees: "/srv/halonic-data/worktrees",
});
console.log(await vcs.status());
```

git reads no user config, so the caller gives the commit author.

## How git is hardened

`GitRunner` starts git by its absolute path (`findGit` looks only in the absolute folders of the `PATH`, and only for `git.exe` on Windows), with an argument array and no shell. Every call:

- points `core.hooksPath` at a folder that must stay empty, and gives the rest of the port's hardening config (`core.fsmonitor`, signing, submodules, maintenance, bundles, credential helpers, commit templates) in the environment through `GIT_CONFIG_COUNT`;
- removes every inherited `GIT_*` variable and reads no system or user config (`GIT_CONFIG_NOSYSTEM`, `GIT_CONFIG_GLOBAL=/dev/null`), nor the user's ignore and attributes files (`core.excludesFile` and `core.attributesFile` blanked). `HOME` stays, because `ssh` needs the user's keys;
- allows only `https` and `ssh` remotes, with `ssh` itself and no password prompt;
- runs only in an absolute folder and never looks for a repository above it (`GIT_CEILING_DIRECTORIES`, which git ignores when relative), and finds programs only in the absolute folders of the `PATH`;
- stops git, and every program it started, past its time or output limit (its process group on macOS and Linux, `taskkill /T` on Windows).

`GitRunner.create` also checks once that its config reaches git: it asks git for `core.hooksPath` in the hooks folder and refuses the program if the answer isn't that folder. A launcher script that clears the `GIT_CONFIG_*` variables before it starts git, as the one first on the `PATH` of an agent runner does, would otherwise run every hook and program the repository names. The error says the program may be a wrapper and asks for the path of git itself (the `git` option).

`close()` ends the runner and removes the hooks folder it made; call it once no call is running.

Before each call in a repository, the adapter checks that the folder is the repository's root, with all of its git files and alternate objects inside the folder, also when `objects`, `refs` or any other file or folder at the top of `.git` is a link. It then lists the repository's config, blanks the filters it and its nested repositories define, sends merge drivers to a conflict and ssh and signing programs back to git's defaults, blanks the interactive diff filter and trailer commands, and gives `diff`, `log`, `show` and `whatchanged` `--no-ext-diff --no-textconv` after the other options. It refuses a repository whose own config sets `branch.<name>.mergeOptions`, `include.path` or `includeIf.<condition>.path`; rewrites remote URLs (`url.<base>.insteadOf`, `pushInsteadOf`) or sets a separate push URL (`remote.<name>.pushurl`); weakens the certificate check (`http.sslVerify`, `http.sslCAInfo`, `http.sslCAPath`, also per URL); or sets any `hook.<name>.*` key, which newer git runs as a hook. Each remote's `uploadpack` and `receivepack` go back to git's defaults on every call, and `pull` and `push` name the programs themselves too. Nested repositories, as gitlinks or not yet tracked, must keep their git folders and alternates inside the workspace as well, even behind a `gitdir:` file. A call may run only the subcommands the adapter uses itself, so `blame`, `stash` and the rest never start a program the repository names, and no option that reads or writes a file it names (`--output`, `config --file`, `commit -F` and the like), and none that starts a program the repository names, the interactive modes `--patch` (`-p`), `--interactive` (`-i`) and `add --edit`, which run the interactive diff filter or an editor.

Private files (`.studio`, `.env`, `.envrc`, `.env.*`) never show in `status`, as they never go into a snapshot.

Paths go to git as arguments, since the runner can't give git a list on stdin or in a file. Windows caps a command line at 32,767 characters, so `stage`, `unstage`, `discard` and a snapshot split a long list of paths into several calls of at most 16,384 characters of paths each. `commitVersion`, `commitWorktreeTo` and a worktree's checkout do the same when they take private files out of an index or put paths back to HEAD, so a first version of a few hundred files stays under the cap. When one of those calls fails, the calls before it stay done.

## Versions

A version is a full commit id (port v2). `snapshot` commits the public files on disk through a copy of the index in `.git`, so the person's branch, index and working tree don't change and the commit is on no branch; `.env` and the other private entries stay out even when `.gitignore` lets them in. `readAt` and `listAt` read a commit's regular files with `ls-tree` and `cat-file blob`, never the working tree, and run no filter. Both check their input before they open the repository, so a version that isn't a full commit id, or a path the port refuses, throws a `RangeError` without running git. `rename` uses `git mv` for what the repository tracks, so the history follows the file.

## Worktrees and patches

`addWorktree` checks a commit out, detached, into a folder of its own inside the `worktrees` folder the `GitVcs` was given, which can't be inside the workspace or hold it; without one, it refuses. The folder's name is the worktree's id, so git's record of it is `.git/worktrees/<id>`. The private entries the commit has stay out of the folder. Every call in a worktree names that record and the folder to git, after checking the record points back at the folder and still shares the workspace's repository, so the `.git` file in the folder, which whatever ran there can rewrite, is never read (HAL-3188). `removeWorktree` deletes the folder and the record without git.

`diffBetween` works on a copy of the worktree's index in its record, so nothing changes, and gives one diff per public file, with `a/` and `b/` prefixes and no renames whatever the repository's config says. `applyPatch` runs `git apply` on the working tree only. First it checks every path twice, as the patch's headers write it and as `git apply --numstat` reads it, and refuses a patch that does more than change a plain file's lines.

## Create version and proposal refs

`commitVersion` builds the version's tree in a temporary index under `.git`, from HEAD: every change on disk goes in, then every change out of scope (outside `include`, under `exclude`, private, or under `.halonic/review`) goes back to HEAD's content. It never runs `git commit -- <paths>`, which would take the working tree's content of every tracked path it names. The commit is made with `commit-tree`, and HEAD moves with `update-ref` from the commit it was at, so a commit made in between is never lost. Then the real index takes the new commit's content for the paths the version changed, so a change left out stays staged as it was.

`commitVersion` checks the paths of `include` and `exclude` the way the port says before it runs git, and refuses an unsafe or private one.

`commitWorktreeTo` commits a worktree's files the same way, through a temporary index in git's record of the worktree, and creates `refs/halonic/proposals/<id>` only if it isn't there. `readRef` reads exactly that ref with `show-ref --verify`, and `deleteRef` deletes it from the commit it points at. Nothing pushes these refs.

The desktop's `git-guard` crate does the same in Rust.

## In other packages' tests

`@halonicjs/adapter-git/testing` gives `testGit()`, the git program this package's tests run: git itself, from its `--exec-path` folder, so a wrapper script found as `git` on the `PATH` doesn't fail the hardening check. Pass it as `GitRunner.create({ git })`. Only tests import it.

## Not yet

- **Pushing to a remote that needs a password.** No credential helper runs, the user's included. Halonic's own helper comes with the keychain work.
- **The repository's own config, through `GitRunner` alone.** The runner on its own doesn't stop programs the repository's config or `.gitattributes` names, such as a filter or an external diff; only the repository checks do, and `GitVcs` runs every call through them. On a workspace you don't trust, use `GitVcs`, not `GitRunner` directly.
