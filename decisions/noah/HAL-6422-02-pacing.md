# Decision: the capture requirement gains an example for a session that dies without a failure marker

- Requirements: `recording.capture`
- Task: HAL-8848, a follow-up from Liam's review of #2545
- Approval: the task asks for this change on HAL-8848; Liam reviews it and signs this note as the CTO
- Kind: internal

## What changes

`recording.capture` gets one more example: a session that ends with a non-zero exit code and no
failure marker, such as a driver whose bash is killed, makes the capture stop with an error that
names the exit code and write no cast. The requirement's rule and its other examples don't change.

## Why

`script` exits 0 whatever happens inside it unless it gets `--return`, so the capture's check of the
exit code never fired. A session that died without a `failed` marker gave a cut-off cast and no
error. `captureSession` now passes `--return`, and the new example records the behaviour that
`capture.session.test.ts` checks end to end.

Nothing is weakened: the example only adds a case the requirement left open.

## Covers

- recording.capture
