# Decision: subagents get every connector tool their file allows, and wait for an OK

- Approval: PR 4 of the design Liam reviewed and approved on [HAL-4700](/HAL/issues/HAL-4700) for [HAL-3361](/HAL/issues/HAL-3361); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ZGrl+t/93XMegv7PL4vWJ+3QqHhY8LDLsdmsPui/Q39PjMV5uxHdeIZNpG3T1LVr1lBrLsZyXskinUUsK/OYAQ==
- Task: HAL-3361

## What changes

PR 1 gave a subagent in a run only the connector tools a `parallel` branch gets (read, nothing under
`approve`), because a subagent couldn't stop the run. PRs 2 and 3 let it stop and go on, so this PR
gives it the tools its own file lists, checked as the state's agent's are: a call under `approve`,
or one `checkToolCall` asks about, waits for a person's OK, and a call that can change things goes
through the effect step. A subagent under a `parallel` branch, at any depth, still gets only the
branch's tools (HAL-4630). This is the old engine's parity (it gave a delegated agent its
connectors' tools) plus plan row E5 (approval tools are no longer dropped in subagents).

`engine.subagent-connector-reads` changes with it: the first example now offers all five `mail`
tools, and it gains examples for a branch's subagent, an `archive` call after the OK, a call under
`approve`, and a subagent whose own file doesn't list the connector its parent uses.
`engine.subagent-tools` gains a "Waits for an OK" section that points to `engine.turn-subagent-stop`
and `engine.turn-subagent-go-on`. `engine.run-connector-approve` says that it holds for a
subagent's model call too. `engine.run-agent-tools` said a subagent's call that needs an OK is
refused and the run doesn't wait (HAL-3338); it now says the run waits, and its last example
approves the call and checks that it runs once.

## Tests

`local-runs-subagent-connectors.test.ts`: the first test's expected tools change from `search` to
all five; four tests are added. `local-runs-agent-tools.test.ts`: "refuses a subagent's call that
needs a person's OK, and the run doesn't wait" becomes "waits for a person's OK on a subagent's
call that needs one, then makes it", with more `expect` calls. No test is removed or skipped, and
no other test changed.

## Covers

- engine.subagent-connector-reads
- engine.subagent-tools
- engine.run-connector-approve
- engine.run-agent-tools
