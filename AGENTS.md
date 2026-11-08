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

Each package declares its layer and owner in `package.json` (`"halonic": { "layer", "owner" }`).
`pnpm check` enforces the table and tells you how to fix a violation. Details:
[docs/guides/checks.md](docs/guides/checks.md).

## Commands

| Command                                                                  | What it does                                                                           |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `pnpm install`                                                           | install dependencies (Node and pnpm versions are pinned; don't override them)          |
| `pnpm verify`                                                            | repo checks, then typecheck, lint, test and build for the packages your change affects |
| `pnpm verify --full`                                                     | the same for every package, as CI runs it                                              |
| `pnpm check [rule …]`                                                    | only the repo checks; takes seconds                                                    |
| `pnpm new package <layer>/<name> --owner <agent> --purpose "<one line>"` | create a package, with its own `AGENTS.md`, that passes every check                    |
| `pnpm new feature <name> --owner <agent> --purpose "<one line>"`         | create a Studio feature and add it to the Studio's feature list                        |
| `pnpm discover`                                                          | rewrite the generated files; `--fix` also repairs the Studio's feature list            |
| `pnpm who-touches <package>`                                             | list open pull requests that change that package                                       |

Never create a package or feature by hand; use the generators. Every package has an `AGENTS.md`
whose owner matches `package.json`; `pnpm check` fails otherwise.

## Before you start

- You need an assigned Paperclip task. Work only in the packages it names.
- One task, one worktree, one branch: `<agent>/<task-id>-<short-name>`, e.g. `alex/HAL-42-agent-explorer-filter`.
- Run `pnpm who-touches <package>` for each package. If an open pull request touches it, coordinate on the task first.
- Commit only as the shared `halonic-dev` account
  (`halonic-dev <353861737+halonic-dev@users.noreply.github.com>`). Never commit under a personal
  or company email address. Check the author of every commit before you push.

## Plan first

Anything that spans more than one package or about 200 lines starts with a short plan on the task.
The maintainer approves it before you write code. When two features must talk, the interface in
`api.ts` lands first as its own small pull request.

## Requirements and tests

The `verifies()` helper and the checks that enforce these rules are not active yet. The rules apply now.

- No feature without a recorded requirement (`requirements/<name>.md`, EARS form) and tests that name it with `verifies("<id>", …)`.
- A bug fix starts with a regression test that fails before the fix.
- Never edit, retire or delete a requirement, and never weaken, skip or delete a test or golden file, without an approved decision note in `decisions/<branch-name>.md`.
- No flaky tests: no retries, fake timers instead of sleeps, always clean up temporary folders.
- Never use real or private workspaces as fixtures; invent them, `acme`-style.

## Code rules

- Readable over short: full names, early returns, no nested ternaries. Comments explain _why_.
- Named exports only. No barrels and no `export *`; each package has one explicit `src/index.ts`.
- No central lists: register through `feature.ts` and folder discovery, never by editing a shared `switch`.
- Relative imports carry the `.ts` extension.
- No `any`, no `@ts-ignore`, no `!` without a comment. Errors are never swallowed.
- Keep files under 300 lines (the check fails at 500) and functions under 60.
- Every exported function, type and class has a doc comment.
- No new dependency without an entry in `tooling/check/dependencies.json` and the maintainer's
  approval ([docs/guides/dependencies.md](docs/guides/dependencies.md)).
- Never pass a secret as a command-line argument.

## Runs anywhere

The engine and server must run on a laptop and on any cloud. Targets (`packages/targets/*`) and
deploy packages are planned; the rules that name them apply once they exist.

- No Node-only APIs in ports, core or `host/server`: Web-standard types only. `node:*` belongs only in Node adapters, the Node target and deploy packages.
- No `setTimeout`/`setInterval` or long-lived memory in core. Timers go through the `Scheduler` port, and the engine advances one step per call.
- No server state in module-level memory. Sessions, limits and locks go behind ports.
- Provider SDKs and tools only in `packages/adapters/<provider>-*` and `packages/targets/<target>/*`.

## Scope

Do what the task asks, nothing more. No unrequested refactors, renames or reformatting. Clean-ups
you spot become a new task.

## Pull requests

- Under about 400 changed lines (generated files, the lockfile and fixtures don't count).
- Title in the form `type(scope): summary`; CI checks it.
- Rebase on `main` before review. `pnpm verify` is green before you ask for review.
- Fill in the template: requirements, how you tested, docs, changeset (or "None"), and the AI tool
  and model you used. Agents leave the sign-off box unticked (see Review).
- Docs change in the same pull request as the behaviour.
- Fix your own CI failures. Never push to `main`.

Stacks stay short, so a closed pull request never strands work above it:

- A stack is at most 3 pull requests deep, counting from `main`.
- Never open a pull request on top of one that isn't approved yet. Start a different, independent
  task instead.
- When a pull request below yours is closed or replaced, rebase or close everything you have above
  it the same day.

## Review

- A second agent reviews every pull request, ideally on a different model, and never the author:
  the package owner, or a teammate if the owner wrote it.
- The maintainer gives final approval only on the core building blocks: `packages/core/*`,
  `packages/host`, the guard (`tooling/check`, `testing/spec`, `.github/workflows`), a new package,
  and any change to a package's public interface (its `api-report.md`). Everything else merges on
  the teammates' approvals.
- The last required reviewer merges, in order: the bottom of a stack first, up to date with `main`
  and CI green.
- The security reviewer also reviews tests, requirements, dependencies and `tooling/check`. The
  CI reviewer reviews build, CI and releases. The docs reviewer reviews docs and community files.
- Agents record approvals in Paperclip, not on GitHub. Outside contributors get a normal GitHub
  review.
- Agents never add a `Signed-off-by` line; the `halonic-dev` account's signed statement covers them.

## Security and privacy

- Never put credentials, keys or tokens in code, comments, documents, commits or pull requests,
  and never commit `.env` files or key files. If you find a secret, report its location, never its value.
- Never write personal names, private workspace details or absolute local paths (a home folder,
  a Windows user folder, an agent's workspace or temporary folder) into the repo, issues or pull
  requests. Use paths relative to the repo root. `pnpm check` and a CI guard block them.
- **Never skip git hooks**: no `--no-verify` on commit or push, and no other way around them. If a
  hook flags a genuine false positive, tell the maintainer on your task with the reason; it gets
  reviewed.
- **Never add a git remote to the old local copy of Halonic.** Its private history must never reach
  this repo. Copy files from it one by one, never by folder, and only when a task says so.

## Generated files

Never edit files in `src/generated/` folders, and never hand-edit `pnpm-lock.yaml`. On a lockfile or
feature-list conflict, run `pnpm discover --fix && pnpm install`.

## When a rule is wrong

Tell the maintainer on your task. The weekly review turns mistakes into rules here, or better, into
checks.
