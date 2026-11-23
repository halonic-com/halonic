# Decision: the Version packages pull request can pass `ci-ok`

- Task: HAL-16929
- Approval: Liam decided it on HAL-16929 for the 0.1.1 release (HAL-16758); it changes `tooling/check/src/guard/`, a trust root of the guard, so Liam and Julian both sign it as guardians
- Kind: user-visible

## What changes

- `tooling/check/src/guard/golden-files.ts`: an **added** released spec
  (`<package>/spec/released/<version>/<name>.schema.json`) is no longer reported as a golden
  change when its text is the same as the package's current `spec/<name>.schema.json` in the pull
  request. That is the copy `pnpm version:sync` writes. An added released spec with any other text
  is still reported, and changing or deleting a released spec stays refused by
  `checkReleasedSpecs`, with or without a note.
- Requirement `check.guard-golden-files` says so, with an example.
- `.github/workflows/ci.yml`: the "Changesets can be versioned" step passes when no changeset is
  waiting, where `changeset version` fails with "No unreleased changesets found". Every pull request
  with a changeset still runs it (HAL-10984).
- `.github/workflows/version-packages.yml`: the bot adds the `built-on:paperclip` label and a
  `Built-on: paperclip` line to the pull request it opens or updates (HAL-3101).

## Why

The 0.1.1 Version packages pull request (#2251) failed all three: it has no changeset left, it adds
the first frozen spec copies, and the bot left out the label. The guard had two rules that disagreed:
`released-specs.ts` (HAL-1664) lets a pull request add a released spec, `golden-files.ts` asked for
a note for it. A copy equal to the current spec adds nothing a note could judge: the current spec is
golden itself, so any change to it already needs a note. Requiring the copy to match keeps someone
from adding a made-up "released" baseline that the API-spec check would compare against.

## Tests

No test was skipped or deleted. In "treats a public API's spec files as golden" the added released
spec is now one with no current spec next to it, so the test still expects two findings. Two new
tests: a copy equal to the current spec passes (it failed before this change), and a copy with other
text is reported.

## Covers

- .github/
- tooling/check/
- check.guard-golden-files
