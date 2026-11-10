# check.decision-sign

- Status: active
- Since: 0.1.0
- Source: HAL-1337

When an approver runs `pnpm decision sign <pull request number>`, the tool shall print the exact text it signs and a `- Signature:` line that the requirement guard verifies, and it shall refuse a note that already has a signature line, has a carriage return, is malformed or is already on the base branch, and a key the base branch's `approvers.json` doesn't pin for the note's kind.

## Examples

- Given an unsigned `internal` note and the CTO's pinned key,
  when the CTO signs it,
  then the tool prints the text and a line, and the guard verifies the note with that line added.
- Given a key that `approvers.json` doesn't pin,
  when it signs a note,
  then the tool refuses and says the key isn't pinned.
