# Decision: the error-output cleaner knows each line of a secret with a line break

- Approval: Liam chose this on HAL-15662 (https://paperclip.halonic.com/HAL/issues/HAL-15662), comment 844db480, as a second PR after #5128. It uses the existing `[secret removed]` words, so no new words from Sofia.
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:HIPNb8nR7h7A9pBAnklAmTvd4TaqEpSZ37lKeo3B+KZgo5sT1TokqIjJrNj07n6zD4EAELJfNb8+lapYEQenAQ==

## What changes

A stdio connector cleans the last lines its program wrote to standard error before showing them
(`ConnectorStoppedError.errorOutput`, `ProgramStoppedAtStartError.errorOutput`, which
`halonic tools review` prints). Its scrubber knew each secret only whole. The error-output tail
keeps lines apart, drops blank lines and trims `\r` and spaces at their end, and #5128 removes only
the first line kept after lines were dropped. So a secret of three or more lines, such as a whole
PEM key, could still show its middle lines when its first line was dropped, and a secret with CRLF
or a blank line inside it wasn't found at all.

- The connector now gives the scrubber each secret and, when the secret holds a line break, each
  of its lines split on `\r?\n`, trimmed, when the line has 8 or more characters. This covers the
  secrets from `secretEnv` and the inherited ones alike.
- Shorter lines, such as the `AB==` that ends a base64 key, are left alone: they can be ordinary
  words of error output and leave too little of a key to use.
- `mcp.stdio-restart` says so, with two new examples.

## Tests

No test is removed or weakened. New tests: the lines `secretAndItsLines` gives (a secret with no
line break, one with several lines, one with CRLF, a blank line and a short line), a stopped
program's `errorOutput` for a four-line secret whose first line was dropped, and for a secret with
CRLF and a blank line inside it. Both connector tests fail without the change.

## Why

A secret's lines are each as secret as the whole, and the tail can't show them whole once it has
split, trimmed or dropped part of them. Removing each line closes the middle lines of a PEM key and
the CRLF and blank-line gaps in one place, inside `packages/adapters/mcp/src/stdio/`.

## Covers

- mcp.stdio-restart
