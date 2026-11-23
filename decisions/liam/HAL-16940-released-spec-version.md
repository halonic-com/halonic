# Decision: a released spec copy passes only under the version it is released as

- Task: HAL-16940
- Approval: a trust-root change written by Liam, a follow-up to HAL-16929; Mateo checks it on HAL-16940, then Julian and Liam sign as the two guardians
- Kind: internal

## What changes

- `tooling/check/src/guard/golden-files.ts`: an added released spec
  (`<package>/spec/released/<version>/<name>.schema.json`) that copies the current spec now passes
  without a note only when `<version>` is the version the pull request releases it under: the
  version `pnpm version:sync` uses (the owning package's `version`, or the Studio app's version in
  `apps/studio/package.json` for a package without one) in the pull request, and that version
  differs from the merge base's. Only the Version packages pull request bumps it. Any other copy is
  reported as an added golden file again.
- Requirement `check.guard-golden-files` says so, with an example.
- `tooling/check/src/test/guard-fixture.ts`: a guard case can give the fixture package a `version`
  on the merge base and in the pull request.

## Why

Mateo's finding on HAL-16929, which Julian agreed with: a released copy can never be changed or
deleted (`checkReleasedSpecs`). Before this change a copy of the current spec passed under any
version folder, so a pull request could plant `spec/released/9.9.9/…` without a note, and the real
9.9.9 release would later fail when `version:sync` wrote different text there. Mateo's check of the
first draft found the second half: on an ordinary pull request the package's version is the one
already released, so a copy under it would claim that release had an API it didn't, and the next
`version:sync` would then see the newest copy equal to the current spec and record nothing for the
real release. Tying the folder to the version `version:sync` uses, and requiring the pull request to
change that version, closes both.

## Tests

No test was skipped or deleted. The two HAL-16929 tests now bump the package from `0.3.0` to
`0.4.0`, the folder they already used. Three new tests, each failing before this change: a copy
under a version other than the package's is reported, a copy under an unchanged version is reported,
and a package without a version takes the app version, bumped or not.

## Covers

- tooling/check/
- check.guard-golden-files
