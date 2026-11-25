# check.catalog-hashes

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2 and 4.2; task HAL-17561; task HAL-18198 (imported files)

If a package that declares `"halonic": { "catalog": … }` has a `src/catalog.generated.ts` that doesn't list exactly its `src/<group>/<name>.ts` files, each with the SHA-256 of its current source and of every file it reaches through relative imports, then the `catalog-hashes` check shall fail on that file and say to run `pnpm discover --fix` and commit it.

## Examples

- Given a catalog file written by `pnpm discover --fix`, then the check passes.
- Given a definition changed after that, then the check fails on `src/catalog.generated.ts` and says to run `pnpm discover --fix`.
- Given a shared file a definition imports, directly or through another file, changed after that, then the check fails the same way.
- Given a definition file added without running it, then the check fails the same way.
- Given a test file `src/github/upload-social-preview.test.ts`, then it isn't an entry.
