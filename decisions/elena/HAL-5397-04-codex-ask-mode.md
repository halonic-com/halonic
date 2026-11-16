# Decision: Codex asks before every command when there is no fence

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-5397 (security condition N2, approved with the plan); Liam reviews this pull request and signs this note
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:NXUZBeMpz96kPp3MoD8KI0LN8EQqJPH5XB+yHz6dCqTXm811qb3aC7xeUlw1IpGFrbO+0SmLev28QdiUod6ZDQ==

## What changes

`harness-codex.start` gains one sentence: in a session with no fence, `thread/start` sets `approvalPolicy` to `untrusted`. A fenced session sets none. No existing example was removed or weakened.

## Why

In "no sandbox" mode nothing confines Codex, so a person has to answer every command (HAL-5397, N2). Codex 0.166.0 refuses `approval_policy = "untrusted"` in `config.toml` ("no longer supported"), so the thread says it itself, and a thread's setting wins over a project's `.codex/config.toml`. Checked by hand against Codex 0.166.0 with a fake model: `ls`, `cat`, `rg`, `git status`, `git diff` and `git log` each asked before running, and a planted `core.fsmonitor` and `diff.external` never ran, also with a trusted project whose own `.codex/config.toml` said `approval_policy = "never"`.

## Covers

- harness-codex.start
- packages/adapters/harness-codex/src/own-sandbox.test.ts
