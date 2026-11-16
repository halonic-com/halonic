# Decision: an answer to a wait card names its wait step

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11240
- Kind: user-visible

A card for a `wait` step used to answer whatever wait step its run was at when the answer arrived. Now an answer names the step it is for, by its state and the time it started waiting, and the engine refuses it when the run has moved on. A person who presses Approve on a card that is out of date gets a refusal and the run's new step stays open.

This changes the Inbox's answer rule (`inbox.decisions`), adds a fourth key to `GET /api/hello` (`server.hello`) so the remote executor can tell whether a host honors it, and adds the wait rule to the `RunExecutor` send contract (`contracts.run-executor-send`) and to the remote executor's `send` (`executor-remote.runs`). The port goes to version 2 (see the ADR dated 2026-11-16). No test was weakened: each requirement gained examples, and every existing example still holds.

## Covers

- inbox.decisions
- server.hello
- contracts.run-executor-send
- executor-remote.runs
