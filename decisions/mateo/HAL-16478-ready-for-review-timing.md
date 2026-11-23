# Decision: ready_for_review answers within an agent's tool call

- Task: HAL-16478
- Approval: found in the first real-PR run of `ready_for_review` on HAL-16478, which Chief asked for there; the reviewer signs this note
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:u6x2S9NLp16XAThnJQa+9T+0nLhfDFsaTVLuU7/bmidgEBmfyG1e4S9jx5BkqnTZXTeFxMioaJ+oNTM6ovzQBw==

## What changes

`paperclip.ready-for-review` said the tool reads a check for about 20 seconds. It now reads it for about 6 seconds (every 2 s, 2 s per request) and then answers `RUNNING` with the check's id, as before. Nothing else in the requirement changes.

## Why

The first real-PR run on 23 Nov showed that an agent's tool call ends after about 10 s (`tool_timeout`), although the plugin host allows 30 s. A call that started a check and then waited 20 s was cut off before it answered: the check ran at the service, but the agent never got its id, and every retry started a new check. A call that only read a finished check answered `PASS` at once. With a 6 s wait the call answers in time, and a check that takes longer is read again with its id.

## Tests

No test was skipped or weakened. The `RUNNING` test now expects the id after one start and two reads (was four reads), and the metrics test expects a call of 4,000 ms (was 8,000 ms) for the same answers.

## Covers

- paperclip.ready-for-review
