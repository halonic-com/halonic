# Decision: Run now and a webhook say why a routine with an unknown trigger value didn't start

- Task: HAL-14883
- Approval: raised by Julian in his review of #4213 on HAL-14298; the change is the task's description on HAL-14883, so the reviewer of this pull request approves it by signing.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:zJgaE+AgLok/S3+InkFGPTbBmmXEC19gGi9EutuIjpnxhRRGdJJ6BLpipdZmm3iX91Pl+unGobdsOrOSlatxDQ==

## What changes

- `server.engine-routines`: Run now for a routine whose input or prompt names a value its trigger doesn't have answers 400 `invalid_input` with the message `halonic validate` gives for `unknown-trigger-value`, instead of the generic 500. It still starts nothing. One example is added; no sentence or test is removed or weakened.
- `server.webhooks`: a signed delivery for such a routine answers the same 400, starts nothing and leaves the delivery id free. One example is added; nothing else changes.

## Why

Since #4213, `routineStart` stops such a routine, but it threw a plain `Error`, so the server answered "The server couldn't answer this request." and the person didn't learn why. It now throws `UnknownTriggerValueError`, an `invalid_input` `KindedError`, and both routes turn it into an answer with `kindedErrorResponse`, the server's one place that maps an error's kind to HTTP. The reason was already safe to show: `halonic validate` prints it.

## Covers

- server.engine-routines
- server.webhooks
