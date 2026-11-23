# Decision: a released spec copy passes only under the version it is released as

- Task: HAL-16940
- Approval: a trust-root change written by Liam, a follow-up to HAL-16929; Mateo checks it on HAL-16940, then Julian and Liam sign as the two guardians
- Kind: internal

## What changes

- `tooling/check/src/guard/golden-files.ts`: an added released spec
  (`<package>/spec/released/<version>/<name>.schema.json`) that copies the current spec now passes
  without a note only when `<version>` is the version `pnpm version:sync` releases it under: the
  owning package's `version` in the pull request, or the Studio app's version
  (`apps/studio/package.json`) for a package without one. A copy under any other version folder is
  reported as an added golden file again.
- Requirement `check.guard-golden-files` says so, with an example.
- `tooling/check/src/test/guard-fixture.ts`: a guard case can give the fixture package a `version`.

## Why

Mateo's finding on HAL-16929, which Julian agreed with: a released copy can never be changed or
deleted (`checkReleasedSpecs`). Before this change a copy of the current spec passed under any
version folder, so a pull request could plant `spec/released/9.9.9/…` without a note, and the real
9.9.9 release would later fail when `version:sync` wrote different text there. Tying the folder to
the version `version:sync` uses closes that.

## Tests

No test was skipped or deleted. The two HAL-16929 tests now give the package version `0.4.0`, the
folder they already used. Two new tests, both failing before this change: a copy under a version
other than the package's is reported, and a package without a version takes the app version.

## Covers

- tooling/check/
- check.guard-golden-files
