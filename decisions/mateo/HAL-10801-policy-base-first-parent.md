# Decision: the policy-base job reads its base copy from the merge ref's first parent

- Task: HAL-10801
- Approval: Liam reviews and signs this note on the review task for the pull request
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:JQ07jRkBmG+CzOgCT0sJ6rHEsNW2l8UX7qkYI9snPNHUA9PALv7zHfPLjDS10Y0hk32BPxoWJ9gf1eC1DvXTAw==

## What changes

In `.github/workflows/ci.yml`, the `policy-base` job ("Policy rules (base commit's copy)") takes
its base copy from `git rev-parse HEAD^1` of the checked-out merge ref, not from
`github.event.pull_request.base.sha`. The checkout reads two commits deep so the parent exists.
In the merge queue the first parent is the commit the group is built on, as before.

The step fails if the first parent can't be read; it never falls back to another ref, so the base
copy can't silently become the pull request's own files.

The rules, the allow-lists and which files are trusted don't change.

## Why

The job checks out the merge ref, which GitHub builds on the current `main`. The recorded base
sha only moves when the pull request is pushed. When `main` added a dependency or a list entry
after that push, the merge tree held it and the base copy's lists didn't, so the job failed on
changes the pull request didn't make, and a re-run didn't help (#3069, run 43811526011).
`base-tests` and `guard` already use the first parent (HAL-5568); this makes `policy-base` match.

## Other jobs checked

`base-tests` already uses `HEAD^1`, and `guard` takes that commit from `base-tests`. `guard` still
reads `approvers.json` from `pull_request.base.sha` on purpose; don't change that. `coverage-floors`, the DCO range and the leak scan
compare the pull request's own head with its recorded base, not the merge ref, so they're
consistent. `changes` diffs the recorded base with the merge ref, which can only run more areas,
never fewer.

## Tests

CI on this pull request runs the changed job. No test was weakened or skipped.

## Covers

- .github/
