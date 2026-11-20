# Decision: CI and the guard's other change lists see a moved file by both its paths

- Task: HAL-13880
- Approval: Julian's follow-up from the #4083 review (HAL-13851). It changes `tooling/check/` and `.github/workflows/ci.yml`, so this note needs both guardians: Liam (CTO) and Julian (security reviewer)
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:wlCCv85FWymweTyKu4qx8io6nXUBPX1SmbvKMExMWyJ5689w5uCdJVgPvvFNQkDSLeMhdEudmC1QS6kL/RICBA==
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:p2eClQxl2ugcGIZbg2IsGlvOZh2l1tzjyN5FZVbf045Zt7rrvXnJdr4/1GwjJUcs1g3gUXtp4TbmB2HT6I5YCA==

## What changes

- `.github/workflows/ci.yml`, "Changed areas" (pull requests and merge groups) and the check for
  `ci.yml` and `.github/actions/` changes in the package list step: `git diff --name-only
  --no-renames`. A file moved out of an area now turns that area's jobs on.
- `tooling/check/src/cli/cloud-affected.ts`: the same flag, in a new `cloudPathsChangedSince`
  function the command calls. A file moved out of a cloud path now counts as a cloud change.
- `tooling/check/src/cli/coverage-floors.ts`: `--no-renames` alone would not help here, because
  floors are matched by the path of `package.json`, and a moved manifest has a new path. The
  check now reads git's renames (`--name-status --find-renames`) and compares a moved
  manifest's floors with its floors at the old path. A floor lowered in the same move is caught.
- `check.cloud-affected`: one sentence and one example for the moved file.

## Why

Git detects renames by default, so these lists showed a moved file only by its new path, as
`selectTests` did before #4083. The guard's own `changedFiles` already uses `--no-renames`.
The merge queue and `main` still run every job, so none of this could let a change onto `main`
untested; a pull request's own run just tested less than it should.

One edge case in coverage floors: if a pull request deletes one package and adds a different
one whose `package.json` is similar enough for git to call it a move, the new package is
compared with the old one's floors. The `coverage-floor-lowered` label allows that, as before.

## Tests

No test was weakened or skipped. Two were added, and both fail without the change: a manifest
moved and lowered in one commit (coverage floors), and a file moved out of `packages/host`
(cloud-affected). The workflow lines have no unit test; the next pull request that moves a file
shows it in its "Changed areas" notice.

## Covers

- tooling/check/
- .github/
- check.cloud-affected
