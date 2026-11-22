# Decision: the gitleaks commit scan passes a range that only deletes files

- Task: HAL-16196
- Approval: the task asks for this change (HAL-16196, found on #5104 for HAL-16184); `.github/` is the guard's own path, so Liam approves this note in review
- Kind: internal

## What changes

- In `.github/actions/gitleaks/action.yml`, when gitleaks reports 0 commits scanned, the commit
  scan step now runs `git log --diff-filter=ACMR` over the same range outside the container. If
  no commit in the range adds, copies, changes or renames a file, it prints a notice and passes.
  Otherwise it fails as before with "No commits were scanned, so the scan proves nothing". If
  that `git log` itself fails, the step fails too.
- The lockfile step doesn't change.

Nothing in the guard's trust roots changes: the requirement guard, `approvers.json` and the
note check don't read the gitleaks action.

## Why

gitleaks reads commits through `git log -p --diff-filter=tuxdb`, which leaves out deletions and
type changes. A pull request whose commits only delete files therefore scans 0 commits, and the
zero-commit guard failed it on every run (#5104 removes one changeset file). Such a range adds
no content, so there is nothing that could leak.

The guard keeps its purpose. It exists because gitleaks reports no leaks when it can't read the
repo at all (a `safe.directory` refusal) or sees no text (a `.gitattributes` trick). In both
cases the check outside the container still lists the commits that add or change files, so the
step still fails.

## Covers

- .github/
