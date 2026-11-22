# Decision: a failed chat turn names its model call's reason

- Approval: the task to build this is HAL-15846; Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:lrAk9MbfAcdK+blQ5eCJFBaVYnUF6s/rAQyfEkiYG5h9MXmSA0+X1pZbAIe/Q9tMZKgplLEcFRQJAQ6c+RGSDw==
- Task: HAL-15846

## What changes

`server.chat-turn` used to answer every failure of a turn with 502 `model_call_failed` and nothing else.
When the failure is a `ModelCallError`, the body now also carries its `reason` (one of
`modelCallErrorReasons`, such as `no-key`). The message stays the fixed sentence, and the error's own
message and host still go only to the host's error log.

`executor-remote.runs` used to reject every refused chat turn with a `RemoteHostError`. A
`model_call_failed` with a known `reason` now rejects with a `ModelCallError` of that reason, with the
host's sentence as its message and the refusal as its `cause`. An unknown reason, or none, still rejects
with the `RemoteHostError`.

## Why

A chat over a remote engine lost why the model call failed, so a missing key read as "The model didn't
answer" and the chat couldn't offer the way to fix it, as it does on a local engine. The reason is a fixed
word from a closed list, so it names no host, key or provider text. The message and host are left out
because they may name a host the caller shouldn't learn.

## Covers

- server.chat-turn
- executor-remote.runs
