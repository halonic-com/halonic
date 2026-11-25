# Decision: OpenCode's prompt opens with the house rules

- Approval: the board asked for it on HAL-17074 (house rules at the top as the default for the OpenCode pilot writer); Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:9oEqILOvJWCOziijBO6zaegdroqoazmsGfvmxAXLzhM8Ekxn3Do0Blz4CsOu5uuayFMKsIqVAiDK86rJn31QAg==

## What changes

The OpenCode run test "starts `opencode run` with the prompt on standard input" read only the first
line of standard input and expected it to be the task's prompt. It now reads all of standard input
and expects the task's prompt as the last line.

## Why

The harness now writes the house rules block before the task's prompt (new requirement
`harness-opencode.house-rules`), so the first line is "HOUSE RULES (read first):". The test still
checks that the prompt reaches OpenCode unchanged; the new requirement's tests check the block and
its place.

## Covers

- packages/adapters/harness-opencode/src/run.test.ts
