# check.affected-tests

- Status: active
- Since: unreleased
- Source: HAL-12539

When a pull request is checked, `affected-tests` shall select the tests of every package with a changed file (a moved file in both the package it left and the one it joined) and of every workspace package that depends on one or whose tests verify one of its requirements (on either side of the change), the tests of `halonic`, `@halonicjs/workspace`, `@halonicjs/test-runner` and `@halonicjs/tooling-publish` (and their dependents) for a change under `examples/`, the tests of the packages that read a changed doc (and their dependents), and the tests of `@halonicjs/tooling-publish`, which bundles the published code, for a changed file under `packages/` or `apps/cli/` that isn't a test file. If a changed file is one every package's tests depend on (the lockfile, the root `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `patches/`, `turbo.json`, `biome.json`, `.gitattributes`, `tooling/config/`, `tooling/check/`, `packages/testing/spec/`, `.github/workflows/` or `.github/actions/`), lies outside every package and isn't docs, a decision note, a changeset or repo metadata, or if no changed file can be read, then it shall select every package's tests.

## Examples

- Given a change to `packages/core/ports/src/blob-store.ts`, then the ports package and every package that depends on it are selected, and a package that doesn't is not.
- Given a change to `pnpm-lock.yaml`, then every package's tests are selected.
- Given a change to `docs/guides/review.md` only, then no package's tests are selected.
- Given a change to `docs/guides/integrations.md`, which the format package's tests read, then the format package is selected.
- Given a change to `infra/turbo-cache/worker.ts`, outside every package, then every package's tests are selected.
- Given a change to `examples/acme/workflows/hello.yaml`, then the CLI, workspace, test-runner and publish packages are selected.
- Given a change to `packages/core/std/src/near-match.ts` or `apps/cli/src/main.ts`, then `@halonicjs/tooling-publish` is selected too, and for a change to `packages/core/std/src/near-match.test.ts` or `apps/studio/` only, it is not.
- Given a change to a package whose requirement another package's tests verify, without depending on it, then that other package is selected too.
- Given a change that deletes a requirement another package's tests still verify, without depending on it, then that other package is selected too.
- Given a file moved from the format package to the workspace package, then both packages (and the workspace package's dependents) are selected.
- Given a base commit git can't compare with, then every package's tests are selected.
