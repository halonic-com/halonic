# Decision: a fenced Claude Code agent with `asks: in-sandbox` works in its folder without asking

- Approval: HAL-14992, Owen's plan approved with changes by Liam; security sign-off by Julian
- Kind: internal

This changes what a run may do. Today every Edit, Write and Bash call of a
Claude Code agent goes to a person: in Studio a card, in a headless
`halonic run` a refusal, so the agent can't change a file. The HAL-12475
smoke run spent $2.08 on a writer whose every edit was refused. Codex in
the fence already edits and runs commands without asking, and its changes
come back as a proposal a person accepts or rejects. This lets a Claude Code
agent do the same, but only when its file says `asks: in-sandbox`
(`format.agent-asks`, in the trust content since the pull request below this
one in the plan).

**What it lets through** (`app.in-sandbox-approvals`), only while the
session's own fence proof says `fenced`: a read or an edit whose real path is
in the session's working folder, never a protected path (`.git` at any depth,
`.claude/`), by the ask policy's existing rules; a `Bash` command, whatever it
says; and `TodoWrite`. The fence, not the command's text, is what limits a
command: it writes only to the working folder (the run's proposal worktree),
reaches only the bridge and the agent's `allowedSites`, and has no secret in
its environment. Parsing shell text for paths would only look safe. Every
other call (other MCP tools, `Task`, `WebFetch`, any path outside, `..`,
links that lead out, device and network paths) goes to the run's approvals
as before.

**Where the fence state comes from.** The engine opens the bridge before the
sandbox, so neither the placement nor the agent file can say whether the
call is fenced. The engine now hands the bridge the opened session
(`engine.harness-bridge-session`), and the policy reads `session.fence` and
`session.profile.workingFolder` on every call. With no session yet, or a
fence that is `off` (the launcher, Claude Code's own sandbox or none),
`not-fenced` or `stopped`, it passes every call on: it fails closed.

**`engine.bridge-approvals`** says "the engine shall never answer yes by
itself". That stays true and the requirement doesn't change. The engine
still answers nothing: the host wraps the run's approvals before the bridge
gets them, and its answer comes from a rule the person trusted in the agent's
file, checked against the fence's own proof. A call the rule lets through is
never asked of the engine, so it writes no `approval.requested`; the run log
gets a `harness.allowed` event for it instead (`events.harness-allowed`, a new
event type, added to the ports' `BridgeEvent`), written before the call
runs. If that record can't be written, the call goes to the person.

The run's changes still come back as a proposal, which a person accepts or
rejects: that is where the human check sits. Network, secrets, `WebFetch` and
`WebSearch`, connector approvals and `localOnly` don't change. The host wiring
that reads the agent file and gives the path resolver comes in the next pull
request; until then nothing calls this.

## Covers

- engine.bridge-approvals
- events.run-log-contract
- packages/core/events/src/run-event.test.ts
