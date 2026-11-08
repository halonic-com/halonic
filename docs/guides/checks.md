# Checks

Every pull request runs the same checks as `pnpm verify --full`. Run
`pnpm verify` before you ask for review: it runs the fast checks and then
typecheck, lint and test for the packages your change affects.

| Command                            | What it does                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify`                      | everything below, for the affected packages (`--full` for every package, as CI does) |
| `pnpm check [rule …]`              | our own repo checks (table below) except `trace`; with rule names, only those        |
| `pnpm check:terms`                 | the personal-terms guard; skipped locally unless you have the list                   |
| `pnpm check:licences`              | every installed package's licence against `tooling/check/licences.json`              |
| `pnpm discover [--fix \| --check]` | writes the generated files; `--fix` also rewrites the Studio's feature list          |
| `pnpm new package <layer>/<name>`  | creates an empty package that passes every check                                     |
| `pnpm new feature <name>`          | creates an empty Studio feature and adds it to the Studio's feature list             |
| `pnpm who-touches [<package>]`     | the open pull requests that change a package; run it before you start                |

## `pnpm check` rules

| Rule             | Fails when                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages`       | a package's name doesn't follow from its folder; it isn't `private` (unless listed under `published` in `tooling/check/policy.json`); it doesn't declare `"halonic": { "layer", "owner" }`; its `exports` expose more than `.` (and `./api` for features); an internal dependency isn't `workspace:*`; a core package is missing from `coreOrder` |
| `layers`         | a dependency or an import breaks the layer table below; a relative import leaves its package; an import goes past another package's `exports`; core or Studio code uses Node APIs; a feature uses another feature other than through its `/api`                                                                                                   |
| `dependencies`   | an external dependency isn't in `tooling/check/dependencies.json`, is used outside its `allowedIn` packages, doesn't use a `catalog:` version, or is dev tooling outside `devDependencies`. See [dependencies.md](dependencies.md)                                                                                                                |
| `names`          | a file or path contains a package name in the `@halonic` or `@studio` npm scope. Both scopes belong to someone else                                                                                                                                                                                                                               |
| `features`       | `apps/studio/package.json` doesn't list exactly the folders in `packages/studio/features/`. Fix with `pnpm discover --fix && pnpm install`                                                                                                                                                                                                        |
| `file-size`      | a source file has more than 500 lines (a warning above 300; a warning for functions above 60). Generated files and fixtures are exempt                                                                                                                                                                                                            |
| `lockfile`       | a `pnpm-lock.yaml` entry has no sha512 hash, or comes from a tarball URL, git, a local folder or another registry. The only exception is the Node runtime from `devEngines`, which must come from the Node.js release hosts with a hash per platform                                                                                              |
| `absolute-paths` | docs, code or config hold an absolute path from one machine, such as a Windows user folder or a Linux home folder. Tests and fixtures are exempt                                                                                                                                                                                                  |

`dco` is wired in already and reports "not active yet". It becomes real
in Phase 1 (plan 12).

## `trace`: requirements and their tests

`pnpm check trace` (plan 9.1, 9.2) reads every `requirements/*.md` file,
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

The requirement guard (plan 9.3) compares a pull request with its merge
base (in the merge queue, the queue's base), including both sides' test
results. It fails on any of these, unless the branch's decision note
covers it:

| Change                                                                                                                                                                                                                        | The note lists             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| an active requirement is edited, retired, demoted to draft, renamed or deleted                                                                                                                                                | the requirement ID         |
| fewer tests ran for a requirement (even if the total stays the same), or its tests make fewer `expect` calls                                                                                                                  | the requirement ID         |
| a test file is deleted, or fewer of its tests ran                                                                                                                                                                             | the test file              |
| a new `.skip`, `.only`, `.todo`, `skipIf`, `runIf`, `ctx.skip()`, `test.fails` or `retry` option in a test file or Vitest config                                                                                              | the file                   |
| a new `vi.mock` of a module in the package a `verifies(…)` test file's requirements are about                                                                                                                                 | the test file              |
| a golden file (`golden/`, `__snapshots__/`, `.snap`) changed, added or deleted, or an inline snapshot changed                                                                                                                 | the golden/test file       |
| a lower coverage floor in `package.json`, a new `v8`/`c8`/`istanbul ignore` comment, or changed `coverage` settings                                                                                                           | the changed file           |
| a file under the guard's own paths changed, added or deleted: `.github/`, `packages/testing/parity/allowed-differences.json`, `packages/testing/spec/`, `tooling/check/`, `tooling/config/src/vitest-preset.ts`, `turbo.json` | that path, as written here |

A package with tests but no readable result file on either side always
fails: no note can stand in for a comparison the guard couldn't make.

**The decision note** is `decisions/<branch-name>.md`, so the branch
`julian/HAL-118-01-x` adds `decisions/julian/HAL-118-01-x.md`:

```markdown
# Decision: retire the old timer rule

- Approval: <link to the Paperclip approval>
- Kind: internal

What changes and why.

## Covers

- workflow.timer-fires
- packages/core/workflow/src/timer.test.ts
```

`Kind` says who approves (D13): `user-visible` changes need the user's
approval, `internal` ones Liam's. The guard asks Paperclip whether the
approval exists, is approved by the right person and names this branch.
**That lookup is a stub for now and fails closed**: it needs a Paperclip
API token as a CI secret, which is parked on HAL-58. Until then no note
lets a change through.

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

Biome's `noSkippedTests` and `noFocusedTests` and Vitest's
`expect.requireAssertions` back the guard up on every run.

## Licences

`pnpm check:licences` reads the installed packages' licences. Production
dependencies must use a licence from the `shipped` list in
`tooling/check/licences.json`; dev tooling may also use the `devOnly`
list. `OR` needs one allowed side, `AND` both. A package whose licence
field is wrong upstream goes under `corrections`, after Julian has
checked it by hand.

## Package names and layers

A package's layer and npm name follow from its folder, so nobody has to
invent a name:

| Folder                            | Layer    | Name                                  |
| --------------------------------- | -------- | ------------------------------------- |
| `packages/core/<name>`            | core     | `@halonicjs/<name>`                   |
| `packages/adapters/<name>`        | adapters | `@halonicjs/adapter-<name>`           |
| `packages/host`                   | host     | `@halonicjs/host`                     |
| `packages/studio/<name>`          | studio   | `@halonicjs/studio-<name>`            |
| `packages/studio/features/<name>` | studio   | `@halonicjs/studio-feature-<name>`    |
| `packages/testing/<name>`         | testing  | `@halonicjs/testing-<name>`           |
| `apps/cli`                        | apps     | `halonic` (the one published package) |
| `apps/<name>`                     | apps     | `@halonicjs/app-<name>`               |
| `tooling/<name>`                  | tooling  | `@halonicjs/tooling-<name>`           |

Who may use what:

| Layer    | May use                                                                                 | Never                                                                                |
| -------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| core     | core packages listed **before** it in `coreOrder`                                       | third-party code, Node APIs, browser APIs                                            |
| adapters | core, other adapters' public entry points, Node or browser APIs, its approved libraries | Studio packages                                                                      |
| host     | core, adapters, Node APIs                                                               | Studio packages                                                                      |
| studio   | core, other Studio packages, React, Tauri, Vite                                         | adapters (only `studio/services` may), Node APIs, a feature (shared Studio packages) |
| apps     | the public entry point of any package                                                   | —                                                                                    |
| testing  | anything                                                                                | being a runtime dependency                                                           |
| tooling  | other tooling packages                                                                  | being a runtime dependency                                                           |

Tests (`*.test.ts`, `test/` folders) and tool config files
(`vitest.config.ts`) may use dev tooling and Node APIs in every layer.

## The personal-terms guard

Nothing private may enter the repo. The list of protected terms is never
in the repo: CI reads it from the `HALONIC_DENY_TERMS` Actions secret, and
you can keep a local copy in `~/.config/halonic/deny-terms` (one term per
line). The guard scans changed files and their names, commit messages and
authors, the branch name and the pull request title and body. It prints
where a term is, never the term, and withholds path parts that contain
one. Harmless technical phrases that contain a term go in
`tooling/check/terms-allowed-phrases.txt`. Until the secret is set, the
guard passes with a warning that says nothing was scanned.

## CI

`.github/workflows/ci.yml` runs on every pull request, in the merge queue
and on `main`. The only required check is `ci-ok`: it always runs, waits
for every other job and fails if any failed. Jobs that only run for some
changes (such as the scaffold check, which proves `pnpm new` still
produces packages that pass) are then skipped without blocking the merge.

| Job                          | What                                                                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fast gates                   | pull request title, `pnpm check`, licences, formatting, the feature list, `pnpm audit` for shipped dependencies                                           |
| Personal-terms guard         | the guard over the change; runs only our own script, no dependencies, so the secret never meets third-party code                                          |
| Secret scan                  | `gitleaks` over the pull request's commits, checksum-verified                                                                                             |
| Workflow lint                | `zizmor` over `.github/`                                                                                                                                  |
| Typecheck, lint, test, build | every task through Turbo; unchanged packages are cache hits. On `main` it then runs `trace`; on a pull request it hands its test results to the guard job |
| Merge base's tests           | pull requests only: the merge base's tests, with no cache and no pull-request code, for the guard's baseline                                              |
| Requirement guard            | pull requests only: `trace` and the requirement guard, run from the merge base's copy with the merge base's dependencies, over both sides' test results   |
| Empty package and feature    | when tooling changes: `pnpm new package`, `pnpm new feature`, `pnpm verify --full`                                                                        |
| Tauri, end-to-end, docs      | stubs that run only when their area changes; real once the desktop shell, the Studio and `apps/docs` exist                                                |

`.github/workflows/scheduled.yml` runs the advisories, the lockfile and
the licence check daily, and the full terms and secret scan over the whole history
weekly. A failure opens an issue.
