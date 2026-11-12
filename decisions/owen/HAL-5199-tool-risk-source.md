# Decision: the engine counts a connector tool's risk itself

- Approval: HAL-5518
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:tAVeVdkKalzBxLPHnNAJbwc0XxdSojYsu/CU+MWqROrCGy834Q8qgfyHE88Hz6mjQNCh6fMSw1Od+uPdiEU5BQ==

A connector's tool listing comes from its server, so the engine no longer
takes the listing's risk as it is. It counts every connector tool as `write`,
except one listed as `send`, which stays `send` so the sending check still
applies. This is what `ports.untrusted-tool-listings` already asks for, and
what the app's `readToolListing` already does. The listing's own risk is kept
for the log only.

What changes, and why each requirement is edited:

- `engine.run-tool-calls`, `engine.run-connector-calls`: a call to a
  connector's tool always waits for a person's OK. One example now approves
  before the call is made.
- `engine.parallel-state`, `engine.parallel-connector-approve`,
  `engine.subagent-connector-reads`: a `parallel` branch, and a subagent
  under one, is offered only tools that count as reading, so it is offered
  no connector tools until a workspace can mark a tool `read`.
- `test-runner.scripted-tools`: a scripted tool is listed with no risk, so a
  `halonic test` case approves its calls as a real run would.
- `engine.local-chat-turn`: a chat refuses a call that needs a person's OK,
  so its first example uses a Halonic tool for the call that runs.

No test was skipped or loosened. Tests were added for the counted risk, and
the tests above now expect the stricter behaviour.

Liam approved keeping this strict in HAL-5518. A workspace setting to mark
safe tools as reading again is a separate question (HAL-5522).

## Covers

- engine.local-chat-turn
- engine.parallel-connector-approve
- engine.parallel-state
- engine.run-connector-calls
- engine.run-tool-calls
- engine.subagent-connector-reads
- test-runner.scripted-tools
