# Decision: Codex follows the agent's asks, and asks by default

- Approval: Paperclip task HAL-15288 (plan approved by Liam, 21 Nov: the default change with `untrusted`, failing closed on `not-fenced` and `stopped`, `HarnessTask.asks`)
- Kind: user-visible

A fenced Codex run had `danger-full-access` and no approval policy, so it never asked, whatever the agent's file said. The format refused `asks` on Codex for that reason. Codex now follows `asks`, as Claude Code does:

- Codex runs without asking only when the task says `asks: "in-sandbox"` and the session's fence proof is `fenced`. Every other case sets `approvalPolicy: "untrusted"` on the thread.
- The default changes: an agent with `asks: always`, or without `asks`, now asks before nearly every command, even `ls`. Codex has nothing between that and never asking for an agent with full access. An unattended `halonic run` then waits for an answer; `asks: in-sandbox` is the fix, and the changeset and the Codex README say so.
- A fix: a session whose fence is `not-fenced` or `stopped` used to start Codex with full access and no asking, if an adapter started a program at all. It now asks, as an `off` session already did.
- `config.toml` stays the same text for every run, whatever `asks` says; a test checks it.
- The format accepts `asks` on `harness: codex`, and still refuses it on Halonic's own loop, now with the code `asks-needs-a-program-harness`.
- `halonic run --harness codex` and `halonic runs send` no longer refuse an agent with `asks`, so `cli.run-harness-asks` now says the run goes on, and the `runs send` refusal test is gone with the refusal.

## Covers

- harness-codex.start
- format.agent-asks
- cli.run-harness-asks
- apps/cli/src/commands/runs/send-follow.test.ts
