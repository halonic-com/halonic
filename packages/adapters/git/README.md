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
- removes every inherited `GIT_*` variable and reads no system or user config (`GIT_CONFIG_NOSYSTEM`, `GIT_CONFIG_GLOBAL=/dev/null`), nor the user's ignore and attributes files (`core.excludesFile` and `core.attributesFile` blanked). `HOME` stays, because `ssh` needs the user's keys;
- allows only `https` and `ssh` remotes, with `ssh` itself and no password prompt;
- runs only in an absolute folder and never looks for a repository above it (`GIT_CEILING_DIRECTORIES`, which git ignores when relative), and finds programs only in the absolute folders of the `PATH`;
- stops git, and every program it started, past its time or output limit (its process group on macOS and Linux, `taskkill /T` on Windows).

`close()` ends the runner and removes the hooks folder it made; call it once no call is running.

Before each call in a repository, the adapter checks that the folder is the repository's root, with all of its git files and alternate objects inside the folder. It then lists the repository's config, blanks the filters it and its nested repositories define, sends merge drivers to a conflict and ssh and signing programs back to git's defaults, blanks the interactive diff filter and trailer commands, and gives `diff`, `log`, `show` and `whatchanged` `--no-ext-diff --no-textconv` after the other options. It refuses a repository whose own config sets `branch.<name>.mergeOptions`, `include.path` or `includeIf.<condition>.path`; rewrites remote URLs (`url.<base>.insteadOf`, `pushInsteadOf`); weakens the certificate check (`http.sslVerify`, `http.sslCAInfo`, `http.sslCAPath`, also per URL); or sets any `hook.<name>.*` key, which newer git runs as a hook. Each remote's `uploadpack` and `receivepack` go back to git's defaults on every call, and `pull` and `push` name the programs themselves too. Nested repositories, as gitlinks or not yet tracked, must keep their git folders and alternates inside the workspace as well, even behind a `gitdir:` file. A call may run only the subcommands the adapter uses itself, so `blame`, `stash` and the rest never start a program the repository names, and no option that reads or writes a file it names (`--output`, `config --file`, `commit -F` and the like).

Private files (`.studio`, `.env`, `.envrc`, `.env.*`) never show in `status`, as they never go into a snapshot.

## Versions

A version is a full commit id (port v2). `snapshot` commits the public files on disk through a copy of the index in `.git`, so the person's branch, index and working tree don't change and the commit is on no branch; `.env` and the other private entries stay out even when `.gitignore` lets them in. `readAt` and `listAt` read a commit's regular files with `ls-tree` and `cat-file blob`, never the working tree, and run no filter. `rename` uses `git mv` for what the repository tracks, so the history follows the file.

The desktop's `git-guard` crate does the same in Rust.

## Not yet

- **Pushing to a remote that needs a password.** No credential helper runs, the user's included. Halonic's own helper comes with the keychain work.
- **The repository's own config, through `GitRunner` alone.** The runner on its own doesn't stop programs the repository's config or `.gitattributes` names, such as a filter or an external diff; only the repository checks do, and `GitVcs` runs every call through them. On a workspace you don't trust, use `GitVcs`, not `GitRunner` directly.
- **Worktrees and patches.** The rest of port v2 (`addWorktree`, `diffBetween`, `applyPatch` and the others in the ADR) comes when the port adds them.
