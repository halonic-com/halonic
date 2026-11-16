# Decision: the lockfile rule checks that a locked tarball is the package's own

- Task: HAL-11256
- Approval: the task asks for this change; Liam reviews it and signs this note as the CTO
- Kind: internal

## What changes

In `tooling/check/src/rules/lockfile.ts`, an npm entry's tarball URL must now be `https://registry.npmjs.org/<name>/-/<basename>-<version>.tgz` for the entry's own name and version. Before, any path on the registry passed, so a lockfile edit could resolve one package to another package's tarball.

## Why

`minimumReleaseAge` and `trustPolicy` judge the package by its name, so a tarball of another package under that name would skip them. The current lockfile passes the stricter rule.

## Tests

No test was skipped or weakened. `lockfile.test.ts` gains a test that refuses a tarball of another package or version, and one that accepts a scoped package's own tarball. The existing tests for a good lockfile still pass.

## Covers

- tooling/check/
