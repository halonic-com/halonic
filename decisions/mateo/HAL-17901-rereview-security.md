# Decision: no rebase-only re-approval by Julian for a security pull request by its paths

- Task: HAL-17901
- Approval: Liam asked for this change on HAL-17901 (Julian's finding in his review of #5744, HAL-17759); he reviews it and signs this note as the CTO
- Kind: internal

## What changes

- `paperclip.pr-watcher-rereview` gains one sentence and one example: a pull
  request whose changed paths make it a security one (`isSecurityPath`: a code
  path with one of the reviewer path words, `docs/security/` or `SECURITY.md`)
  isn't compared, and its handoff goes to the reviewer of its paths (Liam)
  with both heads named and no "Julian: re-approved" line.
- Nothing is weakened: every other sentence and example of the requirement
  stays as it was, and the rebase-only handoff to Julian keeps its test.

## Why

HAL-14809 says security and release pull requests keep their own gates, so
Julian's rebase-only re-approval must not apply to them. Before this change the
watcher skipped such a pull request only when its author wrote the line
`PR watcher: own review task` on the task.

## Covers

- paperclip.pr-watcher-rereview
