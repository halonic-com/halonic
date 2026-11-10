# check.guard-signed-notes

- Status: active
- Since: 0.1.0
- Source: HAL-1337

When the requirement guard checks a decision note's approval, the guard shall verify it only if the note has exactly one `- Signature:` line in its header, made by a key that the base branch's `tooling/check/approvers.json` pins for the note's kind, over this repo, this pull request's number, the note without that line, and the pull request head's contents of every path and requirement the note covers, and the base branch doesn't already have the note.

## Examples

- Given a note signed by the pinned `internal` key for pull request 7,
  when the guard checks it on pull request 7,
  then the approval is verified.
- Given the same signature,
  when the guard checks it on pull request 8 or on a fork with the same branch name,
  then the approval is not verified.
- Given a signed note,
  when a covered test file changes after signing,
  then the approval is not verified, and an edit to an uncovered file changes nothing.
- Given a key that only the pull request's own `approvers.json` lists,
  when the guard checks a note it signed,
  then the approval is not verified.
- Given a note with two signature lines, or one below its first paragraph,
  when the guard reads it,
  then the approval is not verified.
