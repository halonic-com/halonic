# Decision: Claude Code starts with the permission mode said outright

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-5397 (security conditions N1a, N6, N7, N8, approved with the plan); Liam reviewed and approved this pull request on https://paperclip.halonic.com/HAL/issues/HAL-10619 and signs this note
- Kind: internal

## What changes

`harness-claude-code.command` gains `--permission-mode default` among the arguments of `claude -p`, and its test expects the two new arguments. No existing example was removed or weakened.

## Why

In ask mode every tool call has to reach the bridge's permission prompt. A user-level Claude Code setting could otherwise start the session in a mode that skips the prompt. Saying `default` outright keeps the question in front of the person (HAL-5397, N1a).

## Covers

- harness-claude-code.command
- packages/adapters/harness-claude-code/src/command.test.ts
