# Checks

Every pull request runs the same checks as `pnpm verify --full`. Run
`pnpm verify` before you ask for review: it runs the fast checks and then
typecheck, lint and test for the packages your change affects.

| Command                                     | What it does                                                                                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                               | everything below, for the affected packages (`--full` for every package, as CI does)                                                                  |
| `pnpm check [rule …]`                       | our own repo checks (table below) except `trace`; with rule names, only those                                                                         |
| `pnpm check:leaks`                          | the leak guard over the working tree; see [leak-guard.md](leak-guard.md)                                                                              |
| `pnpm check:licences`                       | every installed package's licence against `tooling/check/licences.json`                                                                               |
| `pnpm check:audit [options]`                | `pnpm audit` with the ignored advisories from `tooling/check/advisories-ignored.json` (see [Ignoring an advisory](#ignoring-an-advisory)); CI runs it |
| `pnpm check:bundle --target <t> <metafile>` | after a cloud runtime build: the bundle holds only our code, the provider's and `zod` ([dependencies.md](dependencies.md#cloud-runtime-bundles))      |
| `pnpm discover [--fix \| --check]`          | writes the generated files; `--fix` also rewrites the Studio's feature list                                                                           |
| `pnpm new package <layer>/<name>`           | creates an empty package that passes every check (adapters: add `--runtime <r>`)                                                                      |
| `pnpm new feature <name>`                   | creates an empty Studio feature and adds it to the Studio's feature list                                                                              |
| `pnpm who-touches [<package>]`              | the open pull requests that change a package; run it before you start                                                                                 |

## `pnpm check` rules

| Rule                   | Fails when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages`             | a package's name doesn't follow from its folder; it isn't `private` (unless listed under `published` in `tooling/check/policy.json`); it doesn't declare `"halonic": { "layer", "owner", "coverage" }` or its coverage floor is below its layer's (see below); its `exports` expose more than `.` (and `./api` for features, and the subpaths listed for it under `extraExports` in `policy.json`) or point at a test file; an internal dependency isn't `workspace:*`; a core package is missing from `coreOrder` |
| `layers`               | a dependency or an import breaks the layer table below; a relative import leaves its package; an import goes past another package's `exports`; core, host or Studio code uses Node APIs; non-test code imports a test file; core, host or Studio code loads code the check can't follow (`import(x)` or `require(x)` with a computed name, `createRequire`, `process.getBuiltinModule`, `/// <reference types\|lib>`); a feature uses another feature other than through its `/api`                                |
| `dependencies`         | an external dependency isn't in `tooling/check/dependencies.json`, is used outside its `allowedIn` packages or `layers`, doesn't use a `catalog:` version, or is dev tooling outside `devDependencies`; an entry doesn't fit its category; a catalog version isn't a plain version (`1.2.3`, `^1.2.3`, `~1.2.3`); `overrides`, `resolutions`, `packageExtensions`, `patchedDependencies` or named catalogs are used. See [dependencies.md](dependencies.md)                                                        |
| `advisories`           | `tooling/check/advisories-ignored.json` has an unknown field, a missing or thin reason, a bad advisory ID or date, a repeated advisory, an expired entry or one expiring more than 90 days out; or an advisory is ignored anywhere else (`auditConfig` and `ignoreGhsas` in the workspace file, an `--ignore` on an audit command in a workflow or `package.json`)                                                                                                                                                 |
| `names`                | a file or path contains a package name in the `@halonic` or `@studio` npm scope. Both scopes belong to someone else                                                                                                                                                                                                                                                                                                                                                                                                |
| `features`             | `apps/studio/package.json` doesn't list exactly the folders in `packages/studio/features/`. Fix with `pnpm discover --fix && pnpm install`                                                                                                                                                                                                                                                                                                                                                                         |
| `file-size`            | a source file has more than 500 lines (a warning above 300; a warning for functions above 60). Generated files and fixtures are exempt                                                                                                                                                                                                                                                                                                                                                                             |
| `lockfile`             | a `pnpm-lock.yaml` entry has no sha512 hash, or comes from a tarball URL, git, a local folder or another registry. The only exception is the Node runtime from `devEngines`, which must come from the Node.js release hosts with a hash per platform                                                                                                                                                                                                                                                               |
| `absolute-paths`       | docs, code or config hold an absolute path from one machine, such as a Windows user folder or a Linux home folder. Tests and fixtures are exempt                                                                                                                                                                                                                                                                                                                                                                   |
| `invisible-characters` | docs, code, config or tests hold a character nobody can see: a format character (zero-width, bidi control, tag letter, byte order mark), a variation selector, or a control character other than tab, line feed and carriage return. Emoji with their joiners and selectors, and other visible non-ASCII such as umlauts or CJK, are fine. Write such a character as an escape (`\u202E`) in code; name it in words in docs                                                                                        |
| `readme-examples`      | a package's `examples/` file has no block in its README, or the block (the first `ts` block after the line linking to `examples/<file>`) differs from the file. Only the `../src/index.ts` import may differ: the README names the package. Fix by copying the file into the block                                                                                                                                                                                                                                 |

`requirement-guard` is wired in already and reports "not active yet" until
its real version lands. It will check that changing a requirement, golden
file or test comes with an approved decision note.

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

CI checks the pull request's commits by setting `DCO_RANGE=BASE..HEAD`
and `DCO_PR_AUTHOR` to the login that opened it; a local `pnpm check` has
no range and skips it. To check your branch yourself:

```sh
DCO_RANGE=origin/main..HEAD pnpm check dco
```

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
to the pull request and the check passes.

To run one test file without the floor: `pnpm exec vitest run <file> --coverage.enabled=false`.

If a run says test files "never ran", the coverage it prints leaves those
files out and is not the code's real coverage. Vitest gives each worker 60
seconds to start and set up its test environment, and on a busy machine a
worker can miss that, jsdom ones first. Run the tests again when the machine
is less busy; don't change the tests or the floor.

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
| `apps/cli`                        | apps     | `halonic` (the one published package) |
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
`targets/cloudflare/runtime` and `cloudflare-*` adapters with `"runtime": "workers"` or `"any"`. A core package
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

`cargo-deny` has an ignore list too. It follows the same rule (reason,
expiry, guard) once the Tauri shell brings Rust into the repo; until then
there is no `deny.toml` and nothing to ignore.

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

| Job                          | What                                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Fast gates                   | pull request title, `pnpm check` (with the DCO sign-off), licences, formatting, the feature list, `pnpm audit` for shipped dependencies |
| Leak guard                   | the leak guard over the change; runs only our own script, no dependencies, so the secret never meets third-party code                   |
| Secret scan                  | `gitleaks` over the pull request's commits, checksum-verified                                                                           |
| Workflow lint                | `zizmor` over `.github/`, installed from `.github/zizmor-requirements.txt` by hash                                                      |
| Typecheck, lint, test, build | every task through Turbo; unchanged packages are cache hits                                                                             |
| Empty package and feature    | when tooling changes: `pnpm new package`, `pnpm new feature`, `pnpm verify --full`                                                      |
| Tauri, end-to-end, docs      | stubs that run only when their area changes; real once the desktop shell, the Studio and `apps/docs` exist                              |

`.github/workflows/scheduled.yml` runs the advisories, the lockfile and
the licence check daily, and the full leak guard and secret scan over the whole history
weekly, including every pull request's head commits. A failure opens an issue.

It also runs **mutation testing** every night: Stryker on
`workflow`, `routines`, `schema-kit` and `yaml`, for each package that has
code. The score per package goes into the job summary. It only reports for
now; see [tooling/mutation](../../tooling/mutation/README.md).
