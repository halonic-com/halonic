# Decision: a missing key's line in models allow-address names halonic secret set

- Task: HAL-12397
- Approval: team decision on HAL-12397 (small wording on an approved command's error line); Julian reviews the pull request on HAL-12397 and signs this note
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:A+O2xSxgZrLpxxIvemtxYFjPfl1RCogyMG/hgkLM2YYlpYqoEIiwHaKmMsu2CEuazy4c2Ntaf34XJeDgN3jKCA==

## What changes

When `halonic models allow-address` is run for a key that isn't stored, it still exits 4, and its line now ends with the command that saves the key: `There is no key named "missing-key". Save it first with: halonic secret set missing-key`. Before, it pointed to the Models page, which a CLI user may not have. The example in `cli.commands.models.allow-address` changes with the line, and its test checks the new text. No test was weakened or skipped.

## Why

A CLI user without Studio had no way to act on "Save it on the Models page first." The "Save it first with: <command>" shape matches the existing `serve` hint, and the command can be copied as is, without a trailing period.

## Covers

- cli.commands.models.allow-address
