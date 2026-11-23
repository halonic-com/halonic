# Decision: the base-change notice says how the required note check runs again

- Approval: HAL-16394, asked for on HAL-16326 for #5184; the CTO reviews and signs it
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:mmgxNT6uJulcFpDxo4JOWKzH24uVpeaE5H6Mvjh4Y8+rYYA6GZVXHMkQUN9NTW3JzAgH9gIThyRms249CI4hCQ==

## What changes

- `.github/workflows/pr-details.yml`: the notice on a base change no longer says the note check
  runs again by itself. It says the required note check, the one that blocks the merge, runs
  again only on a push or when the pull request is closed and reopened, and that a reopen keeps
  the head and its approvals.

## Why

GitHub runs the organisation's required copy of `guard-notes.yml` only on `opened`,
`synchronize` and `reopened`, whatever types the file lists. The repository's own run on
`edited` (#5184) gives an early result, but it doesn't clear the block. #5007, #5008 and #5009
stayed blocked for about 7 hours after their base changed. The old wording told the author to
wait for something that doesn't happen. The PR watcher (#5241) already wakes the author in
this case.

## Tests

No test was skipped, weakened or deleted. Only the notice text changes.

## Covers

- .github/
