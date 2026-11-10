# Checks

Every pull request runs the same checks as `pnpm verify --full`. Run
`pnpm verify` before you ask for review: it runs the fast checks and then
typecheck, lint and test for the packages your change affects.

| Command                                                      | What it does                                                                                                                                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                                | everything below, for the affected packages (`--full` for every package, as CI does)                                                                        |
| `pnpm check [rule …]`                                        | our own repo checks (table below) except `trace`; with rule names, only those                                                                               |
| `pnpm check:enqueue`                                         | before you queue a PR: merges the latest `origin/main`, then lockfile, typecheck of every package, format spec tests, process-starts and requirement guards |
| `pnpm check:leaks`                                           | the leak guard over the working tree; see [leak-guard.md](leak-guard.md)                                                                                    |
| `pnpm check:licences`                                        | every installed package's licence against `tooling/check/licences.json`                                                                                     |
| `pnpm check:sbom --name <product> --version <v> --out <dir>` | release only: writes the CycloneDX SBOM and `THIRD-PARTY-NOTICES.txt`, and fails on a library missing from `tooling/check/dependencies.json`                |
| `pnpm check:audit [options]`                                 | `pnpm audit` with the ignored advisories from `tooling/check/advisories-ignored.json` (see [Ignoring an advisory](#ignoring-an-advisory)); CI runs it       |
| `pnpm check:bundle --target <t> <metafile>`                  | after a cloud runtime build: the bundle holds only our code, the provider's and `zod` ([dependencies.md](dependencies.md#cloud-runtime-bundles))            |
| `pnpm discover [--fix \| --check]`                           | writes the generated files; `--fix` also rewrites the Studio's feature list and the folder-discovery globs in `turbo.json`                                  |
| `pnpm new package <layer>/<name>`                            | creates an empty package that passes every check (adapters: add `--runtime <r>`)                                                                            |
| `pnpm new feature <name>`                                    | creates an empty Studio feature and adds it to the Studio's feature list                                                                                    |
| `pnpm who-touches [<package>]`                               | the open pull requests that change a package; run it before you start                                                                                       |

## `pnpm check` rules

| Rule                   | Fails when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages`             | a package's name doesn't follow from its folder; it isn't `private` (unless listed under `published` in `tooling/check/policy.json`); it doesn't declare `"halonic": { "layer", "owner", "coverage" }` or its coverage floor is below its layer's (see below); its `exports` expose more than `.` (and `./api` for features, and the subpaths listed for it under `extraExports` in `policy.json`) or point at a test file; an internal dependency isn't `workspace:*`; a core package is missing from `coreOrder`; `apiTypes` lists a package that isn't core             |
| `layers`               | a dependency or an import breaks the layer table below; a relative import leaves its package; an import goes past another package's `exports`; core, host or Studio code uses Node APIs; non-test code imports a test file; core, host or Studio code loads code the check can't follow (`import(x)` or `require(x)` with a computed name, `createRequire`, `process.getBuiltinModule`, `/// <reference types\|lib>`); a feature uses another feature other than through its `/api`                                                                                        |
| `dependencies`         | an external dependency isn't in `tooling/check/dependencies.json`, is used outside its `allowedIn` packages or `layers`, doesn't use a `catalog:` version, or is dev tooling outside `devDependencies`; an entry doesn't fit its category; a catalog version isn't a plain version (`1.2.3`, `^1.2.3`, `~1.2.3`); an `overrides:` key isn't in `overrides-allowed.json` (or isn't `parent>child` at the catalog version, or has no override); `resolutions`, `packageExtensions`, `patchedDependencies` or named catalogs are used. See [dependencies.md](dependencies.md) |
| `deny-toml`            | `apps/studio/src-tauri/deny.toml`: `[licenses] allow` differs from `shipped` in `licences.json`, or an `[advisories] ignore` entry has no reason, no or several expiry dates in its reason, a date that has passed or is more than 90 days out, or repeats an ID                                                                                                                                                                                                                                                                                                           |
| `advisories`           | `tooling/check/advisories-ignored.json` has an unknown field, a missing or thin reason, a bad advisory ID or date, a repeated advisory, an expired entry or one expiring more than 90 days out; or an advisory is ignored anywhere else (`auditConfig` and `ignoreGhsas` in the workspace file, an `--ignore` on an audit command in a workflow or `package.json`)                                                                                                                                                                                                         |
| `names`                | a file or path contains a package name in the `@halonic` or `@studio` npm scope. Both scopes belong to someone else                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `features`             | `apps/studio/package.json` doesn't list exactly the folders in `packages/studio/features/`. Fix with `pnpm discover --fix && pnpm install`                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `file-size`            | a source file has more than 500 lines (a warning above 300; a warning for functions above 60). Generated files and fixtures are exempt                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `lockfile`             | a `pnpm-lock.yaml` entry has no sha512 hash, or comes from a tarball URL, git, a local folder or another registry. The only exception is the Node runtime from `devEngines`, which must come from the Node.js release hosts with a hash per platform                                                                                                                                                                                                                                                                                                                       |
| `absolute-paths`       | docs, code or config hold an absolute path from one machine, such as a Windows user folder or a Linux home folder. Tests and fixtures are exempt                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `versions`             | the Studio app's version in `apps/studio/src-tauri/tauri.conf.json`, the `[workspace.package]` table of its `Cargo.toml` or a workspace crate in `Cargo.lock` differs from `apps/studio/package.json`, or a crate sets its own version instead of `version.workspace = true`. Fix with `pnpm version:sync`                                                                                                                                                                                                                                                                 |
| `invisible-characters` | docs, code, config or tests hold a character nobody can see: a format character (zero-width, bidi control, tag letter, byte order mark), a variation selector, or a control character other than tab, line feed and carriage return. Emoji with their joiners and selectors, and other visible non-ASCII such as umlauts or CJK, are fine. Write such a character as an escape (`\u202E`) in code; name it in words in docs                                                                                                                                                |
| `readme-examples`      | a package's `examples/` file has no block in its README, or the block (the first `ts` block after the line linking to `examples/<file>`) differs from the file. Only the `../src/index.ts` import may differ: the README names the package. Fix by copying the file into the block                                                                                                                                                                                                                                                                                         |
| `process-starts`       | a product file imports `child_process`, `worker_threads` or `cluster` (with or without `node:`), or loads a module the check can't follow, without an entry in `tooling/check/process-starters.json`, or an entry is stale, has no reason or names no existing test. See [process-starts](#process-starts)                                                                                                                                                                                                                                                                 |

### The DCO sign-off

`dco` fails when a commit in a pull request has no `Signed-off-by: Name
<email>` trailer for its author's email address (how to sign off
is in `CONTRIBUTING.md`). The address is compared without regard to case,
the name may differ, and merge commits are skipped.

Commits by the agents' `halonic-dev` account need no sign-off:
Halonic certifies the DCO for them in
[`docs/legal/dco-standing-statement.md`](../legal/dco-standing-statement.md).
The rule skips a commit only when both its author address and the account
that opened the pull request are on that statement's list, so borrowing
the address in another account's pull request doesn't help. The list
lives in `coveredAccounts` in `tooling/check/src/lib/dco.ts`, and a test
keeps it the same as the statement.

The other way round, a pull request a covered account opened may hold only
that account's own commits. Any other author fails, even with a sign-off
that names it: the runner's default git identity (`Paperclip`) signing off
its own commit would otherwise slip into `halonic-dev`'s history. Agents
therefore set the identity in every clone before their first commit and
never add a `Signed-off-by` line:

```sh
git config user.name halonic-dev
git config user.email 353861737+halonic-dev@users.noreply.github.com
```

To fix commits that already have the wrong author, set the identity as
above, then re-author every commit on the branch and drop its sign-off, and
push with a lease:

```sh
git rebase origin/main --exec 'git log -1 --format=%B | grep -v "^Signed-off-by:" | git commit --amend --reset-author -F -'
git push --force-with-lease
```

CI checks the pull request's commits by setting `DCO_RANGE=BASE..HEAD`
and `DCO_PR_AUTHOR` to the login that opened it; a local `pnpm check` has
no range and skips it. To check your branch yourself:

```sh
DCO_RANGE=origin/main..HEAD pnpm check dco
```

### process-starts

Halonic never runs a file under a skill's `scripts/` folder (HAL-188). Any
code that can start a process could break that, so every such file is
listed and reviewed. `process-starts` fails when a source file imports
`child_process`, `worker_threads` or `cluster` (with or without `node:`)
and isn't listed under `starters` in `tooling/check/process-starters.json`.
A load the check can't follow counts too, in every layer: `import(x)` or
`require(x)` with a computed name, `createRequire` and
`process.getBuiltinModule` could load these modules under any name.
Tests and the testing and tooling packages are exempt: they never ship.
Tool config files such as `vitest.config.ts` aren't, because shipped code
could import one.

To let a file start processes, add an entry with its repo-relative path:

```json
{
  "starters": {
    "packages/adapters/<name>/src/launch.ts": {
      "reason": "Starts stdio connectors the user configured.",
      "scriptsTest": "packages/adapters/<name>/src/launch.test.ts"
    }
  }
}
```

`reason` says why the file needs to start processes, and `scriptsTest` is
an existing test file that shows it refuses to start a file under a
skill's `scripts/` folder. An entry needs Liam's review. The rule also
fails when an entry's file no longer exists or no longer imports any of
these modules (or loads one the check can't follow), so remove the entry
with the code.

## `trace`: requirements and their tests

`pnpm check trace` reads every `requirements/*.md` file,
every `verifies(…)` call in test files and every package's
`test-results/vitest.json`, which the shared Vitest preset writes on each
test run. It reads the tests that actually ran, so run the tests first.
Plain `pnpm check` leaves it out for that reason; it runs only when named.
`pnpm verify` and CI run it last, after the tests. It fails when:

- a requirement file is malformed: the heading isn't the ID its path gives,
  `Status`, `Since` or `Source` is missing or wrong, the sentence isn't in
  EARS form, or an example doesn't read "Given …, (when …,) then …"
- the same requirement ID is in two places
- a test names a requirement that doesn't exist or is retired, or names it
  with something other than a plain string
- a `verifies(…)` never ran, because the package's Vitest config doesn't
  collect its file, or a package with tests has no result file or one that
  can't be read
- an active requirement has no test that ran and passed

`pnpm check trace --report` also writes each package's requirement report
to `test-results/requirements.md`: every requirement, its status, its
tests and whether they passed. `pnpm verify` writes it too. The docs site
will publish it later.

The ID of `packages/core/workflow/requirements/timer-fires.md` is
`workflow.timer-fires`; in a Studio feature,
`packages/studio/features/agents/src/explorer/requirements/filter-by-hub.md`
is `agents.explorer.filter-by-hub`.

## Requirement guard: nothing that works may break

The requirement guard compares a pull request with its merge
base, including both sides' test results. It runs on pull requests only:
the merge queue holds the same change, so it would give the same verdict. It fails on any of these, unless the branch's decision note
covers it:

| Change                                                                                                                           | The note lists       |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| an active requirement is edited, retired, demoted to draft, renamed or deleted                                                   | the requirement ID   |
| fewer tests ran for a requirement (even if the total stays the same), or its tests make fewer `expect` calls                     | the requirement ID   |
| a test file is deleted, or fewer of its tests ran                                                                                | the test file        |
| a new `.skip`, `.only`, `.todo`, `skipIf`, `runIf`, `ctx.skip()`, `test.fails` or `retry` option in a test file or Vitest config | the file             |
| a new `vi.mock` of a module in the package a `verifies(…)` test file's requirements are about                                    | the test file        |
| a golden file (`golden/`, `__snapshots__/`, `.snap`) changed, added or deleted, or an inline snapshot changed                    | the golden/test file |
| a lower coverage floor in `package.json`, a new `v8`/`c8`/`istanbul ignore` comment, or changed `coverage` settings              | the changed file     |

A package with tests but no readable result file on either side always
fails: no note can stand in for a comparison the guard couldn't make.

**The decision note** is `decisions/<branch-name>.md`, so the branch
`alex/HAL-42-retire-timer-rule` adds `decisions/alex/HAL-42-retire-timer-rule.md`:

```markdown
# Decision: retire the old timer rule

- Approval: <link to the Paperclip approval>
- Kind: internal

What changes and why.

## Covers

- workflow.timer-fires
- packages/core/workflow/src/timer.test.ts
```

`Kind` says who approves: `user-visible` changes need the user's
approval, `internal` ones the maintainer's. The guard asks Paperclip whether the
approval exists, is approved by the right person and names this branch.
**That lookup is a stub for now and fails closed**: it needs a Paperclip
API token as a CI secret, which isn't set up yet. Until then no note
lets a change through, so in CI the guard reports its findings as a
warning on the pull request and doesn't block the merge.

**CI runs the guard and `trace` from the merge base's copy** of
`tooling/check`, not the pull request's, so a pull request can't weaken
the checks that judge it. The merge base's test results are the guard's
baseline, so a separate job produces them where no pull-request code
runs: it switches to the merge base before anything runs and reads no
cache (neither Turbo's nor the pnpm store, which a pull request's runs can
write). A third job, which also runs no pull-request code, installs only
the merge base's dependencies, takes both sides' result files and runs
both checks with the merge base's code and Node. To run the guard locally:

```sh
git worktree add --detach ../merge-base "$(git merge-base origin/main HEAD)"
(cd ../merge-base && pnpm install && pnpm exec turbo run test --force)
pnpm exec turbo run test
pnpm exec node ../merge-base/tooling/check/src/cli/requirement-guard.ts --base ../merge-base --branch "$(git branch --show-current)"
```

`pnpm check:enqueue` runs the guard without the tests: `requirement-guard.ts --skip-test-runs` leaves
out the one check that compares test results (CI runs it in full).

Biome's `noSkippedTests` and `noFocusedTests` and Vitest's
`expect.requireAssertions` back the guard up on every run.

## Sharing Turbo's cache between checkouts

Turbo keeps the results of typecheck, lint, test and build in a local cache,
keyed by the package's inputs, so an unchanged package is a cache hit. By
default each checkout has its own cache in `node_modules/.cache/turbo`. On a
machine with many checkouts (agents' worktrees, say), set `TURBO_CACHE_DIR` to
one folder for all of them and they share the results: `pnpm verify` needs no
other change, because Turbo reads the variable itself.

Parallel runs may write to the same folder. Each entry is stored under a name made from its hash, and two runs that
build the same package write the same content. We tried six cold runs at once
on the same hashes, and runs that started while others were still writing, and
every restored output matched its checksum. Nothing in this setup is known to
guard against a run killed halfway through a write; if a restore ever looks
wrong, delete that entry's files.

The folder grows, so prune it:

```sh
TURBO_CACHE_DIR=/path/to/turbo-cache pnpm turbo:prune             # entries unused for 7 days
TURBO_CACHE_DIR=/path/to/turbo-cache pnpm turbo:prune --days 3 --dry-run
```

An entry's last use is its newest access or modification time, so on a
filesystem that doesn't record access times an entry goes 7 days after it was
written, and the next run rebuilds it. A run that reads an entry while it is
deleted just misses and rebuilds. CI keeps its own cache setup in
`ci.yml` and doesn't read this variable from outside.

## Coverage floors

Every package keeps its coverage floor in its own `package.json`, and the
floor only goes up:

```json
"halonic": { "layer": "core", "owner": "maya", "coverage": { "lines": 90, "branches": 85 } }
```

`pnpm test` measures the package's `src` (without tests, `test/` folders
and generated files) and fails below the floor. `pnpm new package` writes
the default for the layer; `pnpm check` fails when a floor is missing or
below the minimum:

| Layer            | Minimum                                 |
| ---------------- | --------------------------------------- |
| core             | 90% of lines, 85% branches              |
| studio           | 85% of lines                            |
| adapters, host   | 80% of lines                            |
| apps (CLI)       | 80% of lines                            |
| testing, tooling | none set; new packages get 80% of lines |

A testing package whose code only runs inside another package's tests, such as
the contract suites inside the adapters, can be measured there instead:

```json
"coverage": { "lines": 80, "measuredIn": "@halonicjs/adapter-memory" }
```

The named package's `pnpm test` then also measures this package's `src`, and
holds each folder to its own floor (its own `src/**` to its own floor, this
package's `src/**` to this one), so neither number flatters the other. This
package's own run still runs its tests, without a floor. `pnpm check` allows
`measuredIn` only in the testing layer, with at least 80% of lines, and only
when the named package lists this one in `dependencies` or `devDependencies`
and runs its tests through the shared preset.

In a pull request, CI compares the floor of every package whose `package.json`
the pull request changes with its floor at the merge base (where the branch left
the target branch), and fails if a value went down or was removed (`pnpm check:coverage-floors <base> <head>`).
New packages and packages with no floor on the target branch pass. If lowering
a floor is deliberate, the maintainer adds the `coverage-floor-lowered` label
to the pull request; the "PR details" workflow then re-runs the check, which
passes.

To run one test file without the floor: `pnpm exec vitest run <file> --coverage.enabled=false`.

If a run says test files "never ran", the coverage it prints leaves those
files out and is not the code's real coverage. Vitest gives each worker 60
seconds to start and set up its test environment, and on a busy machine a
worker can miss that, jsdom ones first. Run the tests again when the machine
is less busy; don't change the tests or the floor.

If the same jsdom files never run, even in a package tested on its own, the
disk is probably too slow. Vitest can't give a worker more than 60 seconds,
and a worker loads jsdom's thousand modules from the pnpm store before it
starts. pnpm puts its store on the same drive as the repo, so a repo on a
Windows drive shared into WSL, or on a network drive, reads every module
through that slow link. Check how long jsdom takes to load from a package
that uses it:

```sh
node -e "const t = performance.now(); require('jsdom'); console.log(Math.round(performance.now() - t), 'ms')"
```

A healthy disk takes under a second. If it takes tens of seconds, put the
store on a local disk and install again:
`pnpm install --store-dir <a folder on a local disk>`.

## Licences

`pnpm check:licences` reads the installed packages' licences. Production
dependencies must use a licence from the `shipped` list in
`tooling/check/licences.json`; dev tooling may also use the `devOnly`
list. `OR` needs one allowed side, `AND` both. A package whose licence
field is wrong upstream goes under `corrections` as `name@version`, after
Julian has checked that version by hand. A correction without a version is
an error.

## Package names and layers

A package's layer and npm name follow from its folder, so nobody has to
invent a name:

| Folder                            | Layer    | Name                                  |
| --------------------------------- | -------- | ------------------------------------- |
| `packages/core/<name>`            | core     | `@halonicjs/<name>`                   |
| `packages/adapters/<name>`        | adapters | `@halonicjs/adapter-<name>`           |
| `packages/host/<name>`            | host     | `@halonicjs/host-<name>`              |
| `packages/targets/<t>/runtime`    | targets  | `@halonicjs/target-<t>-runtime`       |
| `packages/targets/<t>/deploy`     | targets  | `@halonicjs/target-<t>-deploy`        |
| `packages/targets/<t>/testing`    | testing  | `@halonicjs/target-<t>-testing`       |
| `packages/studio/<name>`          | studio   | `@halonicjs/studio-<name>`            |
| `packages/studio/features/<name>` | studio   | `@halonicjs/studio-feature-<name>`    |
| `packages/testing/<name>`         | testing  | `@halonicjs/testing-<name>`           |
| `apps/cli`                        | apps     | `halonic` (published without staging) |
| `apps/<name>`                     | apps     | `@halonicjs/app-<name>`               |
| `tooling/<name>`                  | tooling  | `@halonicjs/tooling-<name>`           |

Who may use what:

| Layer    | May use                                                                                                              | Never                                                                                |
| -------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| core     | core packages listed **before** it in `coreOrder`; its `core-exception` libraries                                    | other third-party code, Node APIs, browser APIs                                      |
| adapters | core, other adapters' public entry points, its approved libraries; Node APIs only with `"runtime": "node"`           | Studio packages                                                                      |
| host     | core; Web-standard APIs                                                                                              | Node APIs, adapters, third-party code, Studio packages                               |
| targets  | runtime: core, host, adapters, its platform's APIs. Deploy: core, adapters, Node APIs, the runtime packages it ships | Studio packages; a runtime never uses a deploy package or another target's runtime   |
| studio   | core, other Studio packages, React, Tauri, Vite                                                                      | adapters (only `studio/services` may), Node APIs, a feature (shared Studio packages) |
| apps     | the public entry point of any package                                                                                | —                                                                                    |
| testing  | anything                                                                                                             | being a runtime dependency                                                           |
| tooling  | other tooling packages                                                                                               | being a runtime dependency                                                           |

`node:*` is allowed in adapters with `"runtime": "node"`, in
`targets/node/runtime` and in every deploy package. `cloudflare:*` is allowed only in
`targets/cloudflare/runtime` and `cloudflare-*` adapters with `"runtime": "workers"` or `"any"`. The API
types packages, listed under `apiTypes` in `policy.json`, use only each other and no third-party code
([decision](../adr/2026-11-09-api-types-stand-alone.md)). A core package
may not be named `root` or `host`, or start with another layer's prefix
(`app-`, `adapter-`, `host-`, `target-`, `studio-`, `testing-`, `tooling-`).

Contract-suite `src/` files (`packages/testing/contracts`, except tests) run on every
target, so they may not use `node:*` outside `src/node/`.

Tests (`*.test.ts`, `*.spec.ts`), tool config files in a package's own
folder (`vitest.config.ts`, not `src/app.config.ts`) and every file of a
testing package may use dev tooling and Node APIs in every layer. A helper
in a `test/` folder is ordinary code: name it `*.test.ts`, or move it into
a testing package. Only tests may import test files.

`tooling/check/policy.json` and `dependencies.json` are read strictly: a
missing field, an unknown one (often a typo) or a wrong type stops
`pnpm check` with the file and field named, instead of skipping a rule.

`extraExports` in `policy.json` lets a core package have a deliberate extra
entry point, such as `{ "@halonicjs/format": ["./recording"] }`. Each entry
names a package in this repo and lists different subpaths: `./` and
lower-case words joined by `-`, never a wildcard, a nested path or
`./api`. A malformed entry stops `pnpm check`; a name that is not a
package here is a `packages` error. Adding an entry is a public interface
change, so it needs Liam's review.

`published` in `policy.json` lists every package that reaches npm. The CLI
`halonic` is published as it is. A package with `halonic.publish` in its
`package.json` stays `private` in the workspace, and
[tooling/publish](../../tooling/publish/README.md) stages the copy that
goes to npm; such a package must be listed too, or `packages` fails. Adding
a name needs Liam's review.

## Ignoring an advisory

`pnpm audit` fails the daily run and the pull request check on a high or
critical advisory in shipped code. When the fix doesn't exist yet, or
the code can't be reached, the decision is written down in
`tooling/check/advisories-ignored.json`, the only place an advisory can be
ignored. `pnpm check:audit` reads it and passes each ID to `pnpm audit
--ignore`; `pnpm check` rejects an ignore anywhere else.

To add an entry, open a pull request that adds this and nothing else:

```json
{
  "ignored": [
    {
      "ghsa": "GHSA-xxxx-xxxx-xxxx",
      "cve": "CVE-2026-12345",
      "package": "name-of-the-package",
      "reason": "Why this is safe for now and what we are waiting for.",
      "expires": "2027-01-31"
    }
  ]
}
```

- `cve` is optional; every other field is required and no others are allowed.
- `reason` is plain language: why we can live with it and what ends it
  (a fix release, a replacement). At least 20 characters.
- `expires` is a real day, `YYYY-MM-DD`, at most 90 days from today.
- Each advisory appears once.

The file is part of the guard, so Liam reviews the pull request. At
expiry the entry stops working: `pnpm check` and `pnpm check:audit` fail
until the dependency is fixed (remove the entry) or someone renews it in a new
pull request with a fresh reason and date. A renewal is a new decision, not
an edit of the date alone.

`cargo-deny` has an ignore list too, in `apps/studio/src-tauri/deny.toml`.
It follows the same rule: each `ignore` entry under `[advisories]` has a
plain-language reason with the expiry date in it, at most 90 days out, and
Liam reviews the pull request. `pnpm check` reads this file (rule
`deny-toml`) and fails on an ignore without exactly one expiry date in its
reason, with a date that has passed or is more than 90 days out. The
"Tauri shell (Rust checks)" job runs `cargo-deny` on every pull request that
touches `apps/studio/src-tauri/`, and `.github/workflows/scheduled.yml` runs
`cargo-deny check advisories` on `main` every week, because a new advisory
can appear against a lockfile nobody touched.

Its licence list is the `shipped` list in `tooling/check/licences.json`, and
the two must stay the same: `pnpm check` fails when they differ. A Rust crate under another licence gets its own
`exceptions` entry in `deny.toml`, which Julian reviews.

## What the TypeScript presets allow

Core and host code may only use Web-standard APIs, so the same code runs
on Node, Workers and in the browser (multi-cloud ADR 5.1). The presets
in `tooling/config/tsconfig/` make that a compile error, not a review
comment:

| Preset        | Used by                                                 | Can name the Web types | Can call `fetch`, `new Request()`, timers | DOM (`document`, `window`) | Node (`process`, `Buffer`, `node:*`) |
| ------------- | ------------------------------------------------------- | ---------------------- | ----------------------------------------- | -------------------------- | ------------------------------------ |
| `core.json`   | core packages                                           | yes                    | no                                        | no                         | no                                   |
| `host.json`   | host packages, Workers code, adapters that run anywhere | yes                    | yes                                       | no                         | no                                   |
| `node.json`   | Node adapters, CLI, tests, tools                        | yes                    | yes                                       | no                         | yes                                  |
| `web.json`    | browser adapters                                        | yes                    | yes                                       | yes                        | no                                   |
| `studio.json` | Studio packages                                         | yes                    | yes                                       | yes                        | no                                   |

"The Web types" are `Request`, `Response`, `Headers`, `URL`,
`URLSearchParams`, `ReadableStream`, `WritableStream`, `TransformStream`,
`AbortSignal`, `TextEncoder`, `TextDecoder` and the `crypto.subtle` types.
Core and host get them from two short files we own,
`tooling/config/types/web-types.d.ts` (interfaces only) and
`web-globals.d.ts` (the values, host only), instead of `lib.dom`, which
would also bring `document` and `window`. A port that needs a member
that isn't there yet adds it, copying the `lib.dom` signature.
`tooling/config/test/fixtures/web-types/` proves each line of the core
and host rows; it fails if a forbidden global starts to compile.

Store a timer as `ReturnType<typeof setTimeout>`, so host code also
type-checks in tests, which use `node.json`.

## The leak guard

Secrets and keys, private key blocks, `.env` and key files, absolute local
paths and personal terms must never reach the repo. The git hooks refuse
them on every commit and push, and CI runs the same rules as the final
gate. See [leak-guard.md](leak-guard.md) for what it checks, how to set up
your deny-terms file and how to allow a false positive.

## CI

`.github/workflows/ci.yml` runs on every pull request, in the merge queue
and on `main`. The only required check is `ci-ok`: it always runs, waits
for every other job and fails if any failed. Jobs that only run for some
changes (such as the scaffold check, which proves `pnpm new` still
produces packages that pass) are then skipped without blocking the merge.

CI starts when a pull request is opened, reopened or gets new commits, not
when its title, body or labels change: that would cancel the run in progress
and build everything again. `.github/workflows/pr-details.yml` handles those
changes. It checks the new title and, if CI's title, leak or coverage-floor
job failed, re-runs CI's failed jobs, which read the pull request's current
title, body and labels. The merge queue checks the title and runs the leak
guard again before a pull request merges. After changing a pull request's
base, push a commit so CI runs against the new base.

On a pull request, the `Changed areas` job decides which of those jobs run
from the pull request's diff. In the merge queue it reads the group's diff
against the commit the group is built on (`main`, or the entry ahead of it
in the queue) and applies the same area rules, so a group that doesn't
touch `apps/studio/src-tauri` skips Tauri and Android. Each entry ahead
checks its own areas before it merges. An empty diff or a diff that can't
be read runs every job. On `main` every job runs, so a gap in the area
rules still shows there ([broken-main.md](broken-main.md)).

The merge queue reruns what a newer base can break: the fast gates, the
leak guard and secret scan, the build with `trace` (from the queued
change's own copy, as on `main`) and the area jobs. It leaves out what
depends only on the pull request itself and already passed on it: the
title and coverage-floor checks, the merge base's tests and the
requirement guard, and the workflow lint unless the group changes
`.github/`.

| Job                          | What                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fast gates                   | pull request title, `pnpm check` (with the DCO sign-off), licences, formatting, the feature list, `pnpm audit` for shipped dependencies                 |
| Leak guard                   | the leak guard over the change; runs only our own script, no dependencies, so the secret never meets third-party code                                   |
| Secret scan                  | `gitleaks` over the pull request's commits, checksum-verified                                                                                           |
| Workflow lint                | `zizmor` over `.github/`, installed from `.github/zizmor-requirements.txt` by hash; in the merge queue only when `.github/` changes                     |
| Typecheck, lint, test, build | every task through Turbo; unchanged packages are cache hits. On `main` and in the queue it then runs `trace`; on a pull request the guard job does      |
| Merge base's tests           | pull requests only: the merge base's tests, with no cache and no pull-request code, for the guard's baseline                                            |
| Requirement guard            | pull requests only: `trace` and the requirement guard, run from the merge base's copy with the merge base's dependencies, over both sides' test results |
| Empty package and feature    | when tooling changes: `pnpm new package`, `pnpm new feature`, `pnpm verify --full`                                                                      |
| Tauri shell (Rust checks)    | when `apps/studio/src-tauri` changes: `rustfmt`, `clippy` and `cargo test` for the shell and its crates on Linux, and `cargo-deny`                      |
| Tauri shell on Windows       | when `apps/studio/src-tauri` changes: `clippy` and `cargo test` again on Windows, for the Windows-only paths                                            |
| End-to-end, docs             | stubs that run only when their area changes; real once the Studio and `apps/docs` exist                                                                 |

`.github/workflows/scheduled.yml` runs the advisories, the lockfile and
the licence check daily, and the full leak guard and secret scan over the whole history
and `cargo-deny check advisories` on the Tauri shell weekly, including every pull request's head commits. A failure opens an issue.

CI caches the pnpm store, Gradle, and the Rust registry and build folders
(keyed on `Cargo.lock` and `rust-toolchain.toml`). Only runs on `main` save
them; pull requests and the merge queue read `main`'s copy. Turbo's cache
is the exception: a pull request saves its own copy for its next push, and
only merge-queue entries never save. GitHub keeps 10 GB of cache per repo,
and a queue entry's copy would never be read again, so saving there
evicted `main`'s.

It also runs **mutation testing** every night: Stryker on
`workflow`, `routines`, `schema-kit` and `yaml`, for each package that has
code. The score per package goes into the job summary. It only reports for
now; see [tooling/mutation](../../tooling/mutation/README.md). To run it on a
branch without running Stryker locally, start `.github/workflows/mutation.yml`:
`gh workflow run mutation.yml --ref <branch> -f packages=<folder>`.

`.github/workflows/cargo-lock.yml` runs only by hand. It regenerates the
Tauri shell's `Cargo.lock` for a branch, for anyone without a Rust
toolchain: run `gh workflow run cargo-lock.yml --ref <branch>`, download
the `cargo-lock` artifact into `apps/studio/src-tauri` and commit it. It
never pushes; the pull request's own CI checks the lockfile.

## The remote cache in CI

CI shares Turbo results through a remote cache: a small Cloudflare Worker with
an R2 bucket (`infra/turbo-cache`). The `build` job reads it on pull requests
and writes to it only on `main` and in the merge queue, so a pull request can't
put anything into the cache that other runs trust. This is enforced by the
tokens, not by a flag: the Worker has a read token (reads and queries only) and
a write token (also uploads). The write token `TURBO_TOKEN` is a secret of the
GitHub environment `turbo-cache-write`, whose deployment branches are `main`
and `gh-readonly-queue/main/*`, so no pull request can read it. Pull requests
get the read token `TURBO_TOKEN_READ`, a repository secret. Entries are signed
(`remoteCache.signature` in `turbo.json`) and expire after 30 days. A run
without the secrets, such as a fork, uses the local cache only. Local runs and
agents don't use the remote cache: they have no token. `base-tests` stays
uncached (`--force`). `actions/cache` stays as the fallback.
