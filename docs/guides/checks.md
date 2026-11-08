# Checks

Every pull request runs the same checks as `pnpm verify --full`. Run
`pnpm verify` before you ask for review: it runs the fast checks and then
typecheck, lint and test for the packages your change affects.

| Command                            | What it does                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm verify`                      | everything below, for the affected packages (`--all` for every package, as CI does) |
| `pnpm check [rule …]`              | our own repo checks (table below); with rule names, only those                      |
| `pnpm check:terms`                 | the personal-terms guard; skipped locally unless you have the list                  |
| `pnpm discover [--fix \| --check]` | writes the generated files; `--fix` also rewrites the Studio's feature list         |
| `pnpm new package <layer>/<name>`  | creates an empty package that passes every check                                    |
| `pnpm new feature <name>`          | creates an empty Studio feature and adds it to the Studio's feature list            |

## `pnpm check` rules

| Rule           | Fails when                                                                                                                                                                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages`     | a package's name doesn't follow from its folder; it isn't `private` (unless listed under `published` in `tooling/check/policy.json`); it doesn't declare `"halonic": { "layer", "owner" }`; its `exports` expose more than `.` (and `./api` for features); an internal dependency isn't `workspace:*`; a core package is missing from `coreOrder` |
| `layers`       | a dependency or an import breaks the layer table below; a relative import leaves its package; an import goes past another package's `exports`; core or Studio code uses Node APIs; a feature uses another feature other than through its `/api`                                                                                                   |
| `dependencies` | an external dependency isn't in `tooling/check/dependencies.json`, is used outside its `allowedIn` packages, doesn't use a `catalog:` version, or is dev tooling outside `devDependencies`. See [dependencies.md](dependencies.md)                                                                                                                |
| `names`        | a file or path contains a package name in the `@halonic` or `@studio` npm scope. Both scopes belong to someone else                                                                                                                                                                                                                               |
| `features`     | `apps/studio/package.json` doesn't list exactly the folders in `packages/studio/features/`. Fix with `pnpm discover --fix && pnpm install`                                                                                                                                                                                                        |
| `file-size`    | a source file has more than 500 lines (a warning above 300; a warning for functions above 60). Generated files and fixtures are exempt                                                                                                                                                                                                            |
| `lockfile`     | a `pnpm-lock.yaml` entry has no sha512 hash, or comes from a tarball URL, git, a local folder or another registry. The only exception is the Node runtime from `devEngines`, which must come from the Node.js release hosts with a hash per platform                                                                                              |

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
`tooling/check/terms-allowed-phrases.txt`.

## CI

`.github/workflows/ci.yml` runs on every pull request, in the merge queue
and on `main`. The only required check is `ci-ok`: it always runs, waits
for every other job and fails if any failed. Jobs that only run for some
changes (such as the scaffold check, which proves `pnpm new` still
produces packages that pass) are then skipped without blocking the merge.

| Job                          | What                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Fast gates                   | pull request title, `pnpm check`, formatting, the feature list, `pnpm audit` for shipped dependencies            |
| Personal-terms guard         | the guard over the change; runs only our own script, no dependencies, so the secret never meets third-party code |
| Secret scan                  | `gitleaks` over the pull request's commits, checksum-verified                                                    |
| Workflow lint                | `zizmor` over `.github/`                                                                                         |
| Typecheck, lint, test, build | every task through Turbo; unchanged packages are cache hits                                                      |
| Empty package and feature    | when tooling changes: `pnpm new package`, `pnpm new feature`, `pnpm verify --full`                               |

`.github/workflows/scheduled.yml` runs the advisories and the lockfile
check daily, and the full terms and secret scan over the whole history
weekly. A failure opens an issue.
