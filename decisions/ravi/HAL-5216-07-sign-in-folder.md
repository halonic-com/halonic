# Decision: detect() asks about the agent's own sign-in

- Approval: the approach was agreed with the harness owner (Owen) on [HAL-5231](/HAL/issues/HAL-5231) for the review follow-ups on [HAL-5216](/HAL/issues/HAL-5216); Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:acUarDBzsUaCguuLocdJYMPtcwDa1no2hcVdGA3lh3YGY2b6EmR7lt1sHeirkfEybEfVOYnCv67UAggioZSQAw==
- Task: HAL-5216

## What changes

- `sandbox-host.program-probe-node` gains one promise: a question may name one settings
  folder, with `CLAUDE_CONFIG_DIR` or `CODEX_HOME`, and the probe sets that variable too. Any
  other question is `failed` and starts nothing. Two examples are added. The rest stays as it was.
- `harness-claude-code.detect` and `harness-codex.detect` ask the sign-in with the agent's
  settings folder when `detect()` is given one. One example each is added.
- `agent-host-client.harness` names the agent's settings folder to the host when `detect` is
  given one.

No test was removed or weakened. `ports.harness-detect-folder` and
`ports.program-probe-settings-folder` are new requirements, so they need no note.

## Why

An agent's runs keep their sign-in in the agent's own settings folder, but `detect()` asked the
programs about the person's own folder. A person signed in there saw "ready", and the agent's
run then failed for want of a sign-in. The ADR `2026-11-11-harness-detect-for-one-agent.md` has
the details and the port versions.

## Covers

- sandbox-host.program-probe-node
- harness-claude-code.detect
- harness-codex.detect
- agent-host-client.harness
