# Decision: subagents still working finish when the task agent's turn fails

- Approval: [HAL-4213](/HAL/issues/HAL-4213)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:AyULoa2YHxVm65EgDrKE1k7LvOrro7IHQ3qda/2OrSIxpV6DftKAUKF5ctt+tQc0kL9+5vDymDtMBGR6hReQCQ==

Liam's review of PR #1308 (HAL-4144) noted that a failed or interrupted
task-agent turn ended the run with its error without finishing the
subagents still working. `harness-codex.subagents` now says that they
finish the same way as when the task agent completes: newest first, with
the output that says the task agent finished first, just before the run
ends with the error. Every `agent.started` then has its end on a failed
run too.

The existing examples stay as they were; one is added, with a test.

## Covers

- harness-codex.subagents
