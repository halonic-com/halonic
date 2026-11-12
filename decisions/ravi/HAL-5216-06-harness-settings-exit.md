# Decision: Claude Code reads only the agent's own settings

- Approval: the approach was agreed with the harness owner (Owen) on HAL-5231 for the review follow-ups on HAL-5216; Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:SgbfzPnl8gQ90dDslLSogJuYDdirRs2YyMEX0pKZ/RZWIZelsI9kX/8PDO/CviY5DeUbS2k1+ATL+x3/oSirAQ==
- Task: HAL-5216

## What changes

`harness-claude-code.command` gains one promise: Claude Code starts with `--setting-sources user`,
so it reads only the settings in the agent's own settings folder, never a working folder's
project or local settings. The command test lists the new arguments. Every other promise and
example stays as it was. No test was removed or weakened.

The new `harness-kit.exit-within` (a bounded wait for a program to exit) is a new requirement, so
it needs no note.

## Why

The threat model already says the adapter starts Claude Code with only the agent's own settings.
The command didn't do it yet, so a working folder's settings could still add permission rules or
hooks when an agent runs on this computer. This makes the code match the threat model.

## Covers

- harness-claude-code.command
