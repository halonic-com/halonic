# AGENTS.md

Rules for every agent and contributor working in this repo. This file is a map: it keeps the rules
short and links to guides in `docs/guides/` for detail. The `AGENTS.md` closest to the file you're
changing wins, so read your package's own `AGENTS.md` too. Only the maintainer changes
this file, and only in a dedicated pull request.

## What this repo is

Halonic is a local-first Studio, engine and CLI for designing, running and supervising AI agent
workflows. Workspaces are plain files in git. The engine records every run as an event log.

| Layer | Where | May use | Never |
| --- | --- | --- | --- |
| core | `packages/core/*` | core packages listed before it in `coreOrder` | third-party code, Node APIs, browser APIs |
| adapters | `packages/adapters/*` | core, other adapters' public entry points, Node or browser APIs, its approved libraries | Studio packages |
| host | `packages/host/*` | core, Web-standard APIs | adapters, Node APIs, third-party code, Studio packages |
| targets | `packages/targets/*` | core, adapters, host (a runtime only) | Studio packages; a runtime using a deploy package; Node APIs in a runtime other than the Node target's |
| studio | `packages/studio/*` | core, other Studio packages, React, Tauri, Vite | adapters (only `studio/services` may), Node APIs, a feature (shared Studio packages) |
| apps | `apps/*` | the public entry point of any package | the CLI: a target other than the Node runtime (it loads deploy targets by name) |
| testing | `packages/testing/*` | anything | being a runtime dependency |
| tooling | `tooling/*` | other tooling packages | being a runtime dependency |

The API types packages (`core/events`, `core/ports`) use only each other, so Studio, the CLI and
outside callers get them without the engine ([ADR](docs/adr/2026-11-09-api-types-stand-alone.md)).

Each package declares its layer and owner in `package.json` (`"halonic": { "layer", "owner" }`).
`pnpm check` enforces the table and tells you how to fix a violation. Details:
[docs/guides/checks.md](docs/guides/checks.md).

## Commands

| Command | What it does |
| --- | --- |
| `pnpm install` | install dependencies (Node and pnpm versions are pinned; don't override them) |
| `pnpm check:enqueue` | the full check before review: your branch merged with the latest `main` |
| `pnpm check [rule …]` | only the repo checks; takes seconds |
| `pnpm new package <layer>/<name> --owner <agent> --purpose "<one line>"` | create a package, with its own `AGENTS.md`, that passes every check |
| `pnpm new feature <name> --owner <agent> --purpose "<one line>"` | create a Studio feature and add it to the Studio's feature list |
| `pnpm discover` | rewrite the generated files; `--fix` also repairs the Studio's feature list |
| `pnpm who-touches <package>` | list open pull requests that change that package |

Local checks (never plain `pnpm verify` or `pnpm verify --full` on your machine; CI runs them):

- Before you push, check what you changed: `git fetch origin`, then
  `pnpm exec turbo run typecheck lint test --filter=...[origin/main]`.
  Outside CI, `turbo.json` caps Turbo at 2 tasks at once and Vitest uses 2 workers (`HALONIC_TEST_WORKERS`
  changes that); CI sets `TURBO_CONCURRENCY` itself. Leave full runs to CI and the merge queue.
  A change under `examples/` alone selects nothing with that filter (Turborepo only maps files to packages),
  so also add `--filter=halonic --filter=@halonicjs/workspace --filter=@halonicjs/test-runner`, the three packages whose tests read it.
- Inside Paperclip, run tests only through the package scripts, which carry the worker cap: never
  `vitest` with `--maxWorkers` above 2 or `node --test --test-concurrency=0`. Run one test suite at a
  time (HAL-7132).
- Inside Paperclip, reuse the workspace's existing `node_modules` and install only when the lockfile
  changed. When you must install, run `pnpm install --frozen-lockfile --prefer-offline` from your
  Paperclip workspace (not a copy under `/tmp`), so pnpm takes packages from the shared store instead
  of fetching and unpacking them again. Never install at the same time as a test run or a render
  (HAL-7399).
- Inside Paperclip, search only inside your own workspace or the repo you're working in: never
  `find /`, `bfs /`, or `rg` / `grep -r` from `/`, and never search the Paperclip folders or another
  agent's workspace. A whole-disk search fills the shared memory. For a file from another repo, use
  `git ls-files` in a clone of it, or ask on the task (HAL-7399).
- Before you ask for review, you can typecheck every package on top of the latest `main`:
  `pnpm exec turbo run typecheck`, or run `pnpm check:enqueue`: it merges the latest
  `origin/main`, then checks the lockfile, typechecks every package, runs the `@halonicjs/format`
  spec tests, the process-starts guard and the requirement guard.

Never create a package or feature by hand; use the generators. Every package has an `AGENTS.md`
whose owner matches `package.json`; `pnpm check` fails otherwise.

## Before you start

- You need an assigned Paperclip task. Work only in the packages it names.
- One task, one worktree, one branch: `<agent>/<task-id>-<short-name>`, e.g. `alex/HAL-42-agent-explorer-filter`.
- Run `pnpm who-touches <package>` for each package. If an open pull request touches it, coordinate on the task first.
- First fix your own open pull requests that conflict with `main` or have a red `ci-ok`. Being behind
  `main` is fine: the merge queue tests every pull request on top of current `main`.
- Commit only as the shared `halonic-dev` account
  (`halonic-dev <353861737+halonic-dev@users.noreply.github.com>`). Never commit under a personal
  or company email address. Check the author of every commit before you push.
- The runner's default git identity is `Paperclip`, not `halonic-dev`. In each new clone or
  worktree, run `git config user.name halonic-dev` and
  `git config user.email 353861737+halonic-dev@users.noreply.github.com` before your first commit.
  Never add a `Signed-off-by` line: the `dco` check fails a `halonic-dev` pull request that holds a
  commit by any other author, signed off or not. The board's pull requests are opened and committed
  as `halonic-dev` too, so the same holds for them.

## Plan first

Anything that spans more than one package or about 200 lines starts with a short plan comment on
the task; go ahead without waiting for an answer. Changes to `packages/core/*`, the guard or a
package's public interface wait for the maintainer's OK on the plan. When two features must talk,
the interface in `api.ts` lands first as its own small pull request.

## Requirements and tests

`trace` is active and blocks a pull request. The requirement guard runs on every pull request and blocks it
through `ci-ok`. A decision note is approved by signature: Liam's key for `user-visible` and `internal` notes, and
for a change to the guard's trust roots (`approvers.json`, the guard workflow and code, the guard commands) two
different guardians' signatures, Liam's and Julian's. Neither signs a pull request they wrote: the other signs,
and Mateo checks it on the review task first. Nobody else has to approve on GitHub. See `docs/guides/checks.md`.

- No feature without a recorded requirement (`requirements/<name>.md`, EARS form) and tests that name it with `verifies("<id>", …)`.
- A bug fix starts with a regression test that fails before the fix.
- If code is hard to unit test, refactor it until it isn't; don't skip the test or reach for an end-to-end test instead.
- Never edit, retire or delete a requirement, and never weaken, skip or delete a test or golden file, without an approved decision note in `decisions/<branch-name>.md`.
- Sign a decision note only from a clean worktree of `origin/main`, reading the note with `git show`, never in the pull request's checkout: its code, hooks and pnpm config would run while your key is loaded. Never read, copy or use another agent's key.
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

- No Node-only APIs in ports, core or `host/server` (planned): Web-standard types only. `node:*` belongs only in Node adapters, the Node target and deploy packages (imports are linted, see `tooling/config/biome.jsonc`).
- No `setTimeout`/`setInterval` or long-lived memory in core. Timers go through the `Scheduler` port, and the engine advances one step per call.
- No server state in module-level memory. Sessions, limits and locks go behind ports.
- Provider SDKs and tools only in `packages/adapters/<provider>-*` and `packages/targets/<target>/*`.

## Scope

Do what the task asks, nothing more. No unrequested refactors, renames or reformatting. Clean-ups
you spot become a new task.

## Waiting on other work

- When a task waits on another task or pull request, link it as a real blocker in Paperclip
  (blocked by `HAL-<n>`, the task that holds the work), never only in words or a status note.
  Paperclip wakes the waiting task when its blocker is done; a note wakes nobody (HAL-18856).
- When work is split to avoid clashes, add the blocker link straight away.
- Never link a blocker to a chief-line thread (the chief of staff's standing threads): they stay
  open, so the waiting task would never wake.

## Pull requests

- About 400 changed lines is a guide, not a limit (generated files, the lockfile and fixtures don't
  count). Bundle small related fixes for one area into one pull request.
- Title in the form `type(scope): summary`; CI checks it.
- Rebase on `main` before review. Locally, run the targeted checks for what you changed (a single
  package's tests, `pnpm check`, or the turbo command under Commands). Then push and let CI (`ci-ok`)
  give the verdict. Never run plain `pnpm verify` or `pnpm verify --full` locally. Local tests use
  two workers; set `HALONIC_TEST_WORKERS` to change that.
- Turbo's cache can be shared between worktrees on one machine: when `TURBO_CACHE_DIR` is set,
  turbo uses it, and a package another worktree already checked is a cache hit. Don't
  set it per worktree. `pnpm turbo:prune` deletes entries unused for 7 days.
- Fill in the template: requirements, how you tested, docs, changeset (or "None"), and the AI tool
  and model you used. A change users will notice, such as one to a released requirement, also
  needs a `.changeset/*.md` that names `@halonicjs/app-studio`, the CLI included
  (`.changeset/README.md`). Agents leave the sign-off box unticked (see Review).
- Docs change in the same pull request as the behaviour.
- Fix your own CI failures. Never push to `main`.

Stacks stay short, so a closed pull request never strands work above it:

- Avoid stacks where you can (HAL-2192). When you need one, it is at most 2 pull requests deep,
  counting from `main`.
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
- After approval, don't rebase or push unless the pull request conflicts with `main` or the merge
  queue asks for it on the pull request. Being behind `main` is fine: the merge queue tests it on
  top of current `main` anyway, and any push needs a new CI run and a new approval
  ([docs/guides/review.md](docs/guides/review.md#after-approval)).
- One reviewer per pull request, picked by the paths it changes (`reviewerFor` in
  `tooling/paperclip/src/reviewer-paths.ts`; `pr_status` names them). Send the task to that
  reviewer, and nobody else reviews it too:
  - the routine reviewer approves alone what the second reviewer may approve, except
    `packages/core/`, `packages/host/`, `packages/testing/spec/`, `tooling/config/`, this file,
    `CLAUDE.md`, `.gitattributes`, the legal files and a public interface (an entry point a
    package exports, such as `src/index.ts` or `src/api.ts`, or its `exports`). A renamed file
    counts by its old path too;
  - the second reviewer approves the rest outside the maintainer's paths, up to 1500 changed lines
    of code (800 in the engine's kernel and the event types);
  - the maintainer reviews everything else: the maintainer's paths (the guard, `.github/`, the
    lockfile and root config among them), security and release pull requests, and anything that
    changes what a run may do
  ([docs/guides/review.md](docs/guides/review.md#who-reviews-what)). A change to
  `packages/core/*`, the guard or a public interface still waits for the maintainer's OK on its
  plan (see "Plan first").
- Nobody queues or merges a pull request by hand (no `gh pr merge`). The Merger queues approved
  pull requests with `ci-ok` green on their head, the bottom of a stack first.
- The security reviewer also reviews tests, requirements, dependencies and `tooling/check`. The
  CI reviewer reviews build, CI and releases. The docs reviewer reviews docs and community files.
- When a CI job fails on `main`, its area's owner gets the task to fix or revert it within
  2 hours. Who owns which area: [docs/guides/area-owners.md](docs/guides/area-owners.md). It
  doesn't change who reviews.
- Start every review finding with a severity tag, `[blocker]`, `[major]`, `[minor]` or `[nit]`,
  one finding per line, on the pull request and on the Paperclip task alike. Untagged findings
  aren't counted. What each tag means, and the reviewer's checklist:
  [docs/guides/review.md](docs/guides/review.md).
- An agent's approval is a signed pull request comment, `<Name>: approved on head <sha>`, never a
  GitHub review. Outside contributors get a normal GitHub review.
- Agents never add a `Signed-off-by` line; the `halonic-dev` account's signed statement covers them.

## The board's pull requests

The board opens its pull requests as `halonic-dev`, like every agent, and marks them with the
`product-owner` label. That label is the board's decision on the change. Only the board's session
adds it; the Merger checks who added it and treats the label as missing if anyone else did.

- Review it like any other pull request: code quality, tests, CI, accessibility and these rules.
  Ask for technical fixes, or push them yourself in a follow-up commit.
- Don't reject or rework the choice itself. If you think it's a real problem, such as a security
  or accessibility failure, say so on the pull request and on the linked Paperclip task; the board
  supervisor takes it to the board.
- The board approves nothing on GitHub. Once it's reviewed and `ci-ok` is green, the Merger queues
  it like any other pull request.
- It carries its rule in words: a decision note saying what changed, the rule, why, and "The
  board's decision". If the note is missing, add it in your review commit rather than block the
  pull request. The guard's rules don't change: the maintainer signs the note, and a trust-root
  change needs both guardians.
- A merge alone wakes nobody. When it merges, the board supervisor posts one Paperclip task saying
  who applies the new rule where. Agents follow the docs and the kit, not the diff.

## Security and privacy

- Never put credentials, keys or tokens in code, comments, documents, commits or pull requests,
  and never commit `.env` files or key files. If you find a secret, report its location, never its value.
- Never write personal names, private workspace details or absolute local paths (a home folder,
  a Windows user folder, an agent's workspace or temporary folder) into the repo, issues or pull
  requests. Use paths relative to the repo root. The leak guard blocks them.
- Never write a board member's name, GitHub login or email in files, commit messages, PR titles or
  bodies. Write "the board". (Paperclip comments are private and may keep using names.)
- **Every working copy has the leak guard's git hooks.** `pnpm install` installs them (it prints
  `leak guard: git hooks installed`). Check with `git config --local core.hooksPath`, which must
  print the `halonic-hooks` folder in your clone's git dir. If `pnpm install` says the hooks were
  NOT installed, fix that before your first commit. Keep your personal terms in `~/.config/halonic/deny-terms`, never in the repo.
  Details: [docs/guides/leak-guard.md](docs/guides/leak-guard.md).
- **Never skip git hooks**: no `--no-verify` on commit or push, and no other way around them.
- **A genuine false positive** goes on the allow-list, never around the hook. For an absolute path
  that has to stay, add `leak-guard: allow absolute-path <reason>` on the same line. For any other
  rule, add `<rule> <file> [fp:<fingerprint>] <reason>` to `tooling/check/leak-allow.txt`; a secret
  needs the fingerprint from the report. Every entry needs a reason. A change to that file is a
  change to the guard, so the maintainer reviews it, in its own pull request or called out in the
  description. A personal term can never be allowed: reword the text.
- Before every release tag, public launch or anything new going public, run the full release
  review: see [docs/guides/release-review.md](docs/guides/release-review.md).
- **Never add a git remote to the old local copy of Halonic.** Its private history must never reach
  this repo. Copy files from it one by one, never by folder, and only when a task says so.

## Releases below 0.9

The board decided (25 Nov 2026) that a release below 0.9 needs no board card or approval when
all of these hold:

1. The full release review (A0) is green for it.
2. The maintainer approved exactly the released head, and it merges with `--match-head-commit`
   on that head.
3. It's a normal release: a version bump plus changelog, with no change to workflows, signing or
   guards.
4. One notice per release goes to the board, through the chief of staff.

If any of 1 to 3 fails, the release goes to the board on a card as before. The GitHub environments
`release`, `npm-publish` and `npm-publish-cli` have no required reviewer; they accept only
`v0.[0-8].*` tags, `release/0.[0-8].*` and `release/halonic-0.[0-8].*` branches, and `main` (for
`release` and `npm-publish`), which changes only through reviewed pull requests. npm still asks a
person to approve a staged version with 2FA. Before any 0.9 release, a reviewed environment must
exist again.

## Generated files

Never edit files in `src/generated/` folders, and never hand-edit `pnpm-lock.yaml`. On a lockfile or
feature-list conflict, run `pnpm discover --fix && pnpm install`.

## When a rule is wrong

Tell the maintainer on your task. The weekly review turns mistakes into rules here, or better, into
checks.
