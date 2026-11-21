# Decision: the lockfile secret scan skips one named test commit

- Task: HAL-14503
- Approval: the task asks for this change (HAL-14503, follow-up from HAL-10997); `.github/` is the guard's own path, so Liam approves this note in review
- Kind: internal

## What changes

- New `.github/actions/gitleaks/lockfile-skip.txt` lists commits whose added `pnpm-lock.yaml`
  lines the lockfile step leaves out, one full 40-character hash per line with a reason. It holds
  one entry: the test commit that proved the lockfile scan works.
- In `.github/actions/gitleaks/action.yml`, the lockfile step logs full hashes and skips the
  added lockfile lines of any commit on that list. Findings still print the short hash. The
  commit scan step doesn't change.
- `docs/guides/leak-guard.md` explains the list under "Allowing a false positive".

Nothing in the guard's trust roots changes: the requirement guard, `approvers.json` and the
note check don't read the gitleaks action.

## Why

The weekly full scan fetches closed pull request refs, and one of them still holds the test
commit with a made-up token on a reserved test domain. It isn't a real secret, but it fails the
scan every week. Skipping by full hash excuses that one commit and nothing added later; a short
hash or a path rule would be wider than needed.

## Covers

- .github/
