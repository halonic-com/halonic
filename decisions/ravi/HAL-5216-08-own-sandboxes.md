# Decision: Claude Code's and Codex's own sandboxes on this computer

- Approval: the approach was agreed with the harness owner (Owen) on HAL-5231, and the per-system split on HAL-5354, for the review follow-ups on HAL-5216; Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:FFzU80q62OzTK0ThYDysoz6CIvAO3NrhAtIcS90MK+lPxL+gxIy98LxNXGE91JqmR52M3TKsgakvv+RftgT0Bw==
- Task: HAL-5216

## What changes

- `harness-claude-code.settings` gains one file: `halonic-unfenced.json`, which turns Claude
  Code's own sandbox on, refuses a command it can't sandbox and still asks before every command.
  It is written for every run, with the same text.
- `harness-claude-code.command` passes `--settings` with that file only outside Halonic's fence,
  where Claude Code's own sandbox works. One example is added.
- `harness-codex.config`: Codex's own sandbox stays off in `config.toml`, and is turned on with
  `-c sandbox_mode="workspace-write"` outside the fence, where it works. One example is added.

`harness-kit.own-sandbox` is a new requirement, so it needs no note. No test was removed or
weakened.

## Why

The threat model says Claude Code and Codex keep their own sandboxes on this computer, but both
were switched off everywhere. Their sandboxes work on macOS, and on Linux with bubblewrap. On
Windows they don't (Codex refuses every shell command, Claude Code has none), so there they stay
off, and Halonic's approval step is the gate. The threat model now says so.

## Covers

- harness-claude-code.settings
- harness-claude-code.command
- harness-codex.config
