# check.decision-note-format

- Status: active
- Since: 0.1.0
- Source: HAL-118 (plan 9.3)

If a pull request's decision note has no heading, no `Approval` link, no `Kind` of `user-visible` or `internal`, no reason or no `## Covers` list, then the requirement guard shall report the note as malformed, at the line to fix, and let nothing through on it.

## Examples

- Given a note with a heading, an approval link, `Kind: internal`, a reason and two Covers entries,
  when the guard reads it,
  then it covers exactly those two entries.
- Given a note without an `Approval` line,
  when the guard reads it,
  then it reports that the approval link is missing.
