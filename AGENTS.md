# AGENTS.md

Rules for every agent and contributor working in this repo. This file is a map: it keeps the rules
short and links to guides in `docs/guides/` for detail. The `AGENTS.md` closest to the file you're
changing wins, so read your package's own `AGENTS.md` too. Only the maintainer changes
this file, and only in a dedicated pull request.

## What this repo is

Halonic is a local-first Studio, engine and CLI for designing, running and supervising AI agent
workflows. Workspaces are plain files in git. The engine records every run as an event log.

| Layer    | Where                 | May use                                                                                 | Never                                                                                |
| -------- | --------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| core     | `packages/core/*`     | core packages listed before it in `coreOrder`                                           | third-party code, Node APIs, browser APIs                                            |
| adapters | `packages/adapters/*` | core, other adapters' public entry points, Node or browser APIs, its approved libraries | Studio packages                                                                      |
| host     | `packages/host`       | core, Web-standard APIs                                                                 | adapters, Node APIs, third-party code, Studio packages                               |
| studio   | `packages/studio/*`   | core, other Studio packages, React, Tauri, Vite                                         | adapters (only `studio/services` may), Node APIs, a feature (shared Studio packages) |
| apps     | `apps/*`              | the public entry point of any package                                                   | —                                                                                    |
| testing  | `packages/testing/*`  | anything                                                                                | being a runtime dependency                                                           |
| tooling  | `tooling/*`           | other tooling packages                                                                  | being a runtime dependency                                                           |

The API types packages (`core/events`, `core/ports`) use only each other, so Studio, the CLI and
outside callers get them without the engine ([ADR](docs/adr/2026-11-09-api-types-stand-alone.md)).

Each package declares its layer and owner in `package.json` (`"halonic": { "layer", "owner" }`).
`pnpm check` enforces the table and tells you how to fix a violation. Details:
[docs/guides/checks.md](docs/guides/checks.md).

## Commands

| Command                                                                  | What it does                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `pnpm install`                                                           | install dependencies (Node and pnpm versions are pinned; don't override them)        |
| `pnpm check:enqueue`                                                     | the check before you queue a pull request: your branch merged with the latest `main` |
| `pnpm check [rule …]`                                                    | only the repo checks; takes seconds                                                  |
| `pnpm new package <layer>/<name> --owner <agent> --purpose "<one line>"` | create a package, with its own `AGENTS.md`, that passes every check                  |
| `pnpm new feature <name> --owner <agent> --purpose "<one line>"`         | create a Studio feature and add it to the Studio's feature list                      |
| `pnpm discover`                                                          | rewrite the generated files; `--fix` also repairs the Studio's feature list          |
| `pnpm who-touches <package>`                                             | list open pull requests that change that package                                     |

Local checks (never plain `pnpm verify` or `pnpm verify --full` on your machine; CI runs them):

- Before you push, check what you changed: `git fetch origin`, then
  `pnpm exec turbo run typecheck lint test --filter=...[origin/main] --concurrency=2`.
- Before you queue a pull request, typecheck every package on top of the latest `main`:
  `pnpm exec turbo run typecheck --concurrency=2`, or run `pnpm check:enqueue`: it merges the latest
  `origin/main`, then checks the lockfile, typechecks every package, runs the `@halonicjs/format`
  spec tests, the process-starts guard and the requirement guard.

Never create a package or feature by hand; use the generators. Every package has an `AGENTS.md`
whose owner matches `package.json`; `pnpm check` fails otherwise.

## Before you start

- You need an assigned Paperclip task. Work only in the packages it names.
- One task, one worktree, one branch: `<agent>/<task-id>-<short-name>`, e.g. `alex/HAL-42-agent-explorer-filter`.
- Run `pnpm who-touches <package>` for each package. If an open pull request touches it, coordinate on the task first.
- Commit only as the shared `halonic-dev` account
  (`halonic-dev <353861737+halonic-dev@users.noreply.github.com>`). Never commit under a personal
  or company email address. Check the author of every commit before you push.
- The runner's default git identity is `Paperclip`, not `halonic-dev`. In each new clone or
  worktree, run `git config user.name halonic-dev` and
  `git config user.email 353861737+halonic-dev@users.noreply.github.com` before your first commit.
  Never add a `Signed-off-by` line: the `dco` check fails a `halonic-dev` pull request that holds a
  commit by any other author, signed off or not.

## Plan first

Anything that spans more than one package or about 200 lines starts with a short plan on the task.
The maintainer approves it before you write code. When two features must talk, the interface in
`api.ts` lands first as its own small pull request.

## Requirements and tests

`trace` is active and blocks a pull request. The requirement guard runs on every pull request but only
reports for now: it doesn't block until its approval lookup is live. See `docs/guides/checks.md`.

- No feature without a recorded requirement (`requirements/<name>.md`, EARS form) and tests that name it with `verifies("<id>", …)`.
- A bug fix starts with a regression test that fails before the fix.
- If code is hard to unit test, refactor it until it isn't; don't skip the test or reach for an end-to-end test instead.
- Never edit, retire or delete a requirement, and never weaken, skip or delete a test or golden file, without an approved decision note in `decisions/<branch-name>.md`.
- No flaky tests: no retries, fake timers instead of sleeps, always clean up temporary folders.
- Never use real or private workspaces as fixtures; invent them, `acme`-style.

## Code rules

- Readable over short: full names, early returns. Comments explain _why_.
- No barrels; each package has one explicit `src/index.ts`.
- The linter enforces the rest of the style: named exports only, `.ts` on relative imports, no `any`, `@ts-ignore` or `!`, no nested ternaries, sorted imports, complexity of 15 or less per function, and the layer import bans above. See `tooling/config/biome.jsonc`; CI runs it.
- No central lists: register through `feature.ts` and folder discovery, never by editing a shared `switch`.
- Thin commands and screens: a CLI command or Studio screen parses its input, calls one app
  service, and formats the result. No business logic in commands or screens
  ([details](docs/guides/code-style.md#thin-commands-and-screens)).
- Errors are never swallowed.
- Keep files under 300 lines (the check fails at 500) and functions under 60.
- Every exported function, type and class has a doc comment.
- No new dependency without an entry in `tooling/check/dependencies.json` and the maintainer's
  approval ([docs/guides/dependencies.md](docs/guides/dependencies.md)).
- Never pass a secret as a command-line argument.
- Waits, updates, resource use and errors follow the failure-path rules
  ([docs/guides/failure-path.md](docs/guides/failure-path.md)).

## Runs anywhere

The engine and server must run on a laptop and on any cloud. Targets (`packages/targets/*`) and
deploy packages are planned; the rules that name them apply once they exist.

- No Node-only APIs in ports, core or `host/server`: Web-standard types only. `node:*` belongs only in Node adapters, the Node target and deploy packages (imports are linted, see `tooling/config/biome.jsonc`).
- No `setTimeout`/`setInterval` or long-lived memory in core. Timers go through the `Scheduler` port, and the engine advances one step per call.
- No server state in module-level memory. Sessions, limits and locks go behind ports.
- Provider SDKs and tools only in `packages/adapters/<provider>-*` and `packages/targets/<target>/*`.

## Scope

Do what the task asks, nothing more. No unrequested refactors, renames or reformatting. Clean-ups
you spot become a new task.

## Pull requests

- Under about 400 changed lines (generated files, the lockfile and fixtures don't count).
- Title in the form `type(scope): summary`; CI checks it.
- Rebase on `main` before review. Locally, run the targeted checks for what you changed (a single
  package's tests, `pnpm check`, or the turbo command under Commands). Then push and let CI (`ci-ok`)
  give the verdict. Never run plain `pnpm verify` or `pnpm verify --full` locally. Local tests use
  two workers; set `HALONIC_TEST_WORKERS` to change that.
- Turbo's cache can be shared between worktrees on one machine: when `TURBO_CACHE_DIR` is set,
  turbo uses it, and a package another worktree already checked is a cache hit. Don't
  set it per worktree. `pnpm turbo:prune` deletes entries unused for 7 days.
- Fill in the template: requirements, how you tested, docs, changeset (or "None"), and the AI tool
  and model you used. Agents leave the sign-off box unticked (see Review).
- Docs change in the same pull request as the behaviour.
- Fix your own CI failures. Never push to `main`.

Stacks stay short, so a closed pull request never strands work above it:

- A stack is at most 3 pull requests deep, counting from `main`.
- Open a stack all at once, for one review (see Review). Once that review has started, don't add
  more pull requests on top of the stack. Start a different, independent task instead.
- When a pull request below yours is closed or replaced, rebase or close everything you have above
  it the same day.

## Review

- A second agent reviews every pull request, ideally on a different model, and never the author:
  the package owner, or a teammate if the owner wrote it.
- A stack gets one review, on one task: each reviewer reviews all its pull requests together and
  approves the whole stack once. The layers then merge bottom-up without another round. A layer
  that has only been rebased since the approval needs no new review; a layer whose content changed
  goes back to the same reviewer for that layer only.
- The maintainer gives final approval only on the core building blocks: `packages/core/*`,
  `packages/host`, the guard (`tooling/check`, `testing/spec`, `.github/workflows`), a new package,
  and any change to a package's public interface (its `api-report.md`). Everything else merges on
  the teammates' approvals.
- The last required reviewer merges, in order: the bottom of a stack first, up to date with `main`
  and CI green.
- The security reviewer also reviews tests, requirements, dependencies and `tooling/check`. The
  CI reviewer reviews build, CI and releases. The docs reviewer reviews docs and community files.
- Start every review finding with a severity tag, `[blocker]`, `[major]`, `[minor]` or `[nit]`,
  one finding per line, on the pull request and on the Paperclip task alike. Untagged findings
  aren't counted. What each tag means, and the reviewer's checklist:
  [docs/guides/review.md](docs/guides/review.md).
- Agents record approvals in Paperclip, not on GitHub. Outside contributors get a normal GitHub
  review.
- Agents never add a `Signed-off-by` line; the `halonic-dev` account's signed statement covers them.

## Security and privacy

- Never put credentials, keys or tokens in code, comments, documents, commits or pull requests,
  and never commit `.env` files or key files. If you find a secret, report its location, never its value.
- Never write personal names, private workspace details or absolute local paths (a home folder,
  a Windows user folder, an agent's workspace or temporary folder) into the repo, issues or pull
  requests. Use paths relative to the repo root. The leak guard blocks them.
- **Every working copy has the leak guard's git hooks.** `pnpm install` installs them (it prints
  `leak guard: git hooks installed`). Check with `git config --local core.hooksPath`, which must
  print `tooling/check/hooks`. If `pnpm install` says the hooks were NOT installed, fix that before
  your first commit. Keep your personal terms in `~/.config/halonic/deny-terms`, never in the repo.
  Details: [docs/guides/leak-guard.md](docs/guides/leak-guard.md).
- **Never skip git hooks**: no `--no-verify` on commit or push, and no other way around them.
- **A genuine false positive** goes on the allow-list, never around the hook. For an absolute path
  that has to stay, add `leak-guard: allow absolute-path <reason>` on the same line. For any other
  rule, add `<rule> <file> [fp:<fingerprint>] <reason>` to `tooling/check/leak-allow.txt`; a secret
  needs the fingerprint from the report. Every entry needs a reason. A change to that file is a
  change to the guard, so the maintainer reviews it, in its own pull request or called out in the
  description. A personal term can never be allowed: reword the text.
- **Never add a git remote to the old local copy of Halonic.** Its private history must never reach
  this repo. Copy files from it one by one, never by folder, and only when a task says so.

## Generated files

Never edit files in `src/generated/` folders, and never hand-edit `pnpm-lock.yaml`. On a lockfile or
feature-list conflict, run `pnpm discover --fix && pnpm install`.

## When a rule is wrong

Tell the maintainer on your task. The weekly review turns mistakes into rules here, or better, into
checks.
