# check.affected-tests

- Status: active
- Since: unreleased
- Source: HAL-12539

When a pull request is checked, `affected-tests` shall select the tests of every package with a changed file and of every workspace package that depends on one, and the tests of `halonic`, `@halonicjs/workspace` and `@halonicjs/test-runner` (and their dependents) for a change under `examples/`. If a changed file is one every package's tests depend on (the lockfile, the root `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `patches/`, `turbo.json`, `biome.json`, `.gitattributes`, `tooling/config/`, `tooling/check/`, `packages/testing/spec/`, `.github/workflows/` or `.github/actions/`), lies outside every package and isn't docs, a decision note, a changeset or repo metadata, or if no changed file can be read, then it shall select every package's tests.

## Examples

- Given a change to `packages/core/ports/src/blob-store.ts`, then the ports package and every package that depends on it are selected, and a package that doesn't is not.
- Given a change to `pnpm-lock.yaml`, then every package's tests are selected.
- Given a change to `docs/guides/review.md` only, then no package's tests are selected.
- Given a change to `infra/turbo-cache/worker.ts`, outside every package, then every package's tests are selected.
- Given a change to `examples/acme/workflows/hello.yaml`, then the CLI, workspace and test-runner packages are selected.
