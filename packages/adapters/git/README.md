# @halonicjs/adapter-git

The `Vcs` port on the real `git` program, for one workspace folder. git always runs hardened, whether the workspace is trusted or not (plan section 11).

- **Layer:** adapters
- **Owner:** tomas
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-git`

The hardened runner and the repository checks are in; the `Vcs` itself follows (HAL-2607).

## Example

```ts
import { GitRunner } from "@halonicjs/adapter-git";

const runner = await GitRunner.create();
const result = await runner.run({
  cwd: "/srv/workspaces/acme",
  args: ["status", "--porcelain=v2"],
});
console.log(result.code, result.stdout.toString());
```

## How git is hardened

`GitRunner` starts git by its absolute path (`findGit` looks only in the absolute folders of the `PATH`, and only for `git.exe` on Windows), with an argument array and no shell. Every call:

- points `core.hooksPath` at a folder that must stay empty, and gives the rest of the port's hardening config (`core.fsmonitor`, signing, submodules, maintenance, bundles, credential helpers, commit templates) in the environment through `GIT_CONFIG_COUNT`;
- removes every inherited `GIT_*` variable and reads no system or user config (`GIT_CONFIG_NOSYSTEM`, `GIT_CONFIG_GLOBAL=/dev/null`);
- allows only `https` and `ssh` remotes, with `ssh` itself and no password prompt;
- runs only in an absolute folder and never looks for a repository above it (`GIT_CEILING_DIRECTORIES`, which git ignores when relative), and finds programs only in the absolute folders of the `PATH`;
- stops git, and every program it started, past its time or output limit.

Before each call in a repository, the adapter checks that the folder is the repository's root, with all of its git files and alternate objects inside the folder. It then lists the repository's config, blanks the filters it and its nested repositories define, sends merge drivers to a conflict and ssh and signing programs back to git's defaults, and gives `diff`, `log`, `show` and `whatchanged` `--no-ext-diff --no-textconv`. It refuses a repository whose own config sets `branch.<name>.mergeOptions`, `include.path` or `includeIf.<condition>.path`.

The desktop's `git-guard` crate does the same in Rust.

## Not yet

- **The repository's own config, through `GitRunner` alone.** The runner on its own doesn't stop programs the repository's config or `.gitattributes` names, such as a filter or an external diff; only the repository checks do. The `Vcs`, which comes next, runs every call through them. Until then, don't run `GitRunner` directly on a workspace you don't trust.
- **Process allow-list.** `src/node/run-process.ts` is the only file that starts a process. It needs an entry in `tooling/check/process-starters.json` once HAL-188's check lands, with `src/skill-scripts.test.ts` as its `scriptsTest`.
