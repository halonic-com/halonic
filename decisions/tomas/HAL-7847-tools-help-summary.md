# Decision: `halonic tools revoke` says nothing was removed when it stops at a tool that isn't approved

- Approval: Liam asked for this on [HAL-7847](/HAL/issues/HAL-7847) (N1 of the words check on
  HAL-7823), small wording on approved CLI output, a team decision with no board card (HAL-2282
  rule); Liam approves this note in his review of this pull request
- Kind: internal
- Task: HAL-7847

## What changes

- `halonic tools --help` says "Remove your approval of listed tools", since `revoke` is the only
  verb that exists.
- When more than one tool is named and `revoke` stops at one that isn't approved, the error gets a
  second line, "Nothing was removed.". It is true: `revoke` checks every name before it removes
  any. With one tool named the line is left out, so golden `revoke-not-approved` is unchanged.

## Tests

No test was weakened and no golden file changed. One golden file is added,
`revoke-not-approved-several.txt` (colour, `NO_COLOR` and `--json`), with a test in
`revoke.test.ts`.

## Covers

- apps/cli/src/commands/tools/golden/revoke-not-approved-several.txt
