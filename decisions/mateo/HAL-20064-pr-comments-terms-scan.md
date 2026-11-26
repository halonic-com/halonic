# Decision: a daily job scans pull request comments and reviews for personal terms

- Approval: the task asks for this change (HAL-20064; Chief's decision on HAL-20058 that pull request
  comments are not accepted and a scheduled check covers them); Liam approves and signs this note
  in review
- Kind: internal

## What changes

A new requirement, `check.leak-pr-comments`, and a new job in `scheduled.yml`, "Personal terms in
pull request comments". It runs on the daily schedule and on a manual run. It scans pull request
bodies, comments, review bodies and review comments updated since the newest run whose scan
succeeded, or every pull request on a manual full scan or when there is no such run. It uses the
`HALONIC_DENY_TERMS` secret of the `leak-terms` environment and skips texts by the logins in the new
`HALONIC_BOARD_LOGINS` secret of that environment. A hit opens or updates one issue that lists only
pull request numbers and links. Without terms the job passes with a notice. The job is added to the
`report` job's `needs`, so an API failure opens the usual "Scheduled checks failed" issue. No
existing requirement, test or guard rule changes.

## Why

The leak guard checks a pull request's title, body and commits when they change, but a comment
can't be checked before it is posted. A scheduled scan is the only place these texts get checked.

## Covers

- check.leak-pr-comments
- .github/
- tooling/check/
