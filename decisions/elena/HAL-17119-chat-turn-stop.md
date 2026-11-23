# Decision: Stop in a local chat turn aborts its model call

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17119 (Elena's engine fix; Liam approves this note in review)
- Kind: internal

`engine.local-chat-turn` gains one sentence and one example: when the request's `signal` aborts,
the local executor aborts the model call going on, tries no other model, and rejects with the
signal's reason. Every other promise and example stays as it was, and no test was removed or
weakened; one test is added.

## Why

`ChatTurnRequest.signal` says an executor that honors it stops the model call, and the remote
path does (the host passes its request's signal, `server.chat-turn`). The local executor dropped
it, so Stop in a chat on the in-process engine let the model answer to its end, and paid for it,
before the chat service dropped the answer. Runs already stop their model calls
(`engine.model-call-stop`), and harness chat turns stop theirs (`engine.chat-harness-turn`); this
brings the local model chat turn in line.

## Covers

- engine.local-chat-turn
