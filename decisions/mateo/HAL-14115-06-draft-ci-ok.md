# Decision: a draft's light run doesn't report as `ci-ok`

- Approval: Mateo's proposal on HAL-14115 (21 Nov 00:58, "a recurring queue cause"), held until after the HAL-14331 freeze; it changes `.github/workflows/ci.yml`, which holds the guard job, so Liam and Julian both sign it as guardians
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:mLE7g69ArGLAqJOsluyl8dWETERoh9HlCzbIhge7makeO1UAvMvr/P9eBCfFHOReUH8LFO8i4Crgiyk9omcFAw==
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:rAk7G4SXVSiJK59TnTTy896E6dc9PhryMUPXiGKloptDTOpsDd6N+mskA3VFpM630InZxlvMAPN3g0QBAcKMBg==

## What changes

- `.github/workflows/ci.yml`: the `ci-ok` job's name depends on the run. In a draft pull
  request's run it is `ci-ok (draft, light run)`; in every other run it stays `ci-ok`. The job
  itself, what it waits for and when it fails don't change.
- `docs/guides/checks.md`: the draft paragraph says what to wait for on a draft. The build row
  also names the publish tests that #4223 added to a pull request's selection (Nina's C455 docs
  check, HAL-14691).

## Why

A draft gets a light run: the merge base's tests and the requirement guard skip
(`needs.changes.outputs.full`). Its `ci-ok` still passed, because a skipped job counts as passed.
So a draft showed the same green `ci-ok` as a ready pull request whose guard had run. On 21 Nov,
#4223 was green as a draft (run 44839502925) and failed the guard as soon as it was marked ready
(run 44841959808).

With another name, a draft's run doesn't report the required check at all, so GitHub shows
`ci-ok` as expected and pending until the full run that marking it ready starts. A green `ci-ok`
then always comes from a run in which the guard could run. The light run's result is still on the
pull request, under its own name, so an author still sees a failure early.

**Not done: failing `ci-ok` on a draft.** Every draft would then show a red required check, and
a red `ci-ok` means "fix this" to authors, reviewers and the queue session.

**Not done: running the guard on drafts.** The merge base's tests run every affected test again
without a cache, the cost the light run exists to avoid (HAL-12419).

A ready pull request that goes back to draft keeps its full run's `ci-ok` until its next push,
whose light run then leaves `ci-ok` pending again.

## Tests

No code changes. CI on this pull request shows both names: its draft run reports
`ci-ok (draft, light run)`, and its run after being marked ready reports `ci-ok`.

## Covers

- .github/
