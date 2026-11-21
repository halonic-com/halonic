# Decision: the harnesses' own sandboxes start wherever Halonic's fence isn't proven

- Approval: Paperclip task HAL-15326, plan approved by Liam on the task
- Kind: internal

Claude Code's and Codex's own sandboxes used to start only for a session whose
fence is `off`. A session whose fence is `not-fenced` or `stopped` started them
without it: Codex with `danger-full-access`, Claude Code without its unfenced
settings. The port refuses `start` in those states, so this only matters for an
adapter that breaks that promise, and then the harness's own sandbox is the only
one left around the agent's commands.

The rule is now `fence.state !== "fenced"` in both harnesses: Halonic's fence
counts only when it's proven, and everywhere else the harness's own sandbox
starts where `harness-kit.own-sandbox` says it works. The requirements say so,
with the fence states named. Nothing that worked before stops working: inside a
proven fence nothing changes, and where the own sandbox doesn't work the run
still starts without it.

## Covers

- harness-codex.config
- harness-claude-code.command
- harness-kit.own-sandbox
