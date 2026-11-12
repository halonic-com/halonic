# Decision: write task ids as plain text in the Source line of 89 requirements

- Task: HAL-7143, part 1 (#2124); rebased for the README tracker-link fix on HAL-7194
- Approval: Liam approved the change in review on HAL-7151 and signs this note
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:tK3JNOYOHZ0vreCpZ9P6BMmfLoPiMSEAEBx5VZU9Ho4x7aiyWH9WjI8wDpPz+dFRdLrVcxDtyD2JIE3xp3ETDg==

## What changes

Only the `- Source:` line of each covered requirement. Links into the task tracker, such as
`[cli-output](/HAL/issues/HAL-1981#document-cli-output)` or `[HAL-4305](/HAL/issues/HAL-4305)`,
become plain text: `cli-output (HAL-1981)` or `HAL-4305`. Those links only work inside
Paperclip and are dead for anyone reading the repo. The same script rewrote every file, with no
hand edits, and it also dropped trailing spaces on the lines it touched.

No statement, example or status changes, so no behaviour, test or golden file changes. The
guard counts any change to an active requirement's file as an edit, so the Source lines need
this note.

## Covers

- app.agent-placement
- app.run-start
- cli.run-failed-local-only
- cli.run-failed-sandbox
- cli.run-harness
- cli.run-sandbox-gate
- cli.sandbox-gate
- cli.source-listing
- contracts.agent-placement-store
- contracts.connector-call-hints
- contracts.resource-probe
- engine.artifact-created
- engine.busy-falls-back
- engine.connector-effects
- engine.end-interrupted-runs
- engine.run-connector-calls
- engine.run-failure-reason-of
- engine.task-choice-answer
- engine.task-json-answer
- engine.turn-logs-risk
- engine.unknown-outcome
- events.agent-finished-error
- events.approval-resolved-by
- events.blocked-sites
- events.connector-started
- events.effect-requested
- events.llm-skipped
- events.run-failed-answer-not-an-option
- events.run-failed-disk-full
- events.run-failed-harness-start-failed
- events.run-failed-interrupted
- events.run-failed-key-refused
- events.run-failed-model-out-of-memory
- events.run-failed-model-unreachable
- events.run-failed-out-of-credit
- events.run-failed-provider-busy
- events.run-failed-reason
- events.run-failed-sandbox-not-ready
- events.run-failed-sandbox-start-failed
- events.sandbox-blocked
- events.started-events
- events.summary-sends
- events.tool-call-as-text
- events.tool-result-outcome
- events.tool-result-risk
- events.workflow-finished-context
- format.agent-sandbox-fields
- format.reserved-folder
- format.workflow-test-programs
- fs-node.agent-placement-store-files
- harness-checks.claude-code
- harness-checks.codex
- harness-checks.header-tap
- inbox.approval-card
- inbox.approval-title
- inbox.argument-fields
- inbox.count
- inbox.decisions
- inbox.home
- inbox.items
- inbox.live
- inbox.page
- inbox.plain-values
- inbox.wait-card
- inbox.waiting-time
- memory.agent-placement-store
- memory.resource-probe
- password-pbkdf2.no-work-before-refusal
- password-pbkdf2.runtime-neutral
- plugins.plugin-text
- ports.agent-placement-store
- ports.chat-turn-skipped
- ports.connector-call-hints
- ports.model-call-error
- ports.model-out-of-memory-text
- ports.password-hash-format-pbkdf2-chain
- ports.resource-probe
- ports.run-failure-error
- runs.list
- runs.row
- runs.row-columns
- runs.run-page
- runs.run-view.blocked-sites
- runs.run-view.live-or-saved
- std.site-name
- system-node.resource-probe
- test-runner.scripted-programs
- workspace.harness-working-folders
- workspace.trust-agents
