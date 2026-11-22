# check.decision-sign-stale

- Status: active
- Since: unreleased
- Source: HAL-16390

When an approver runs `pnpm decision sign <pull request number>` on a note that already has a `- Signature:` line from the same key, the tool shall print a new line and say that it replaces the old one if the old line no longer matches the pull request's head, and shall refuse if it still matches.

## Examples

- Given a note the CTO signed and a rebase that changed a covered file,
  when the CTO signs it again,
  then the tool prints a new line, says it replaces the CTO's old one, and the guard verifies the note with the new line in its place.
- Given a note the CTO signed and nothing changed since,
  when the CTO signs it again,
  then the tool refuses and says the signature still matches.
