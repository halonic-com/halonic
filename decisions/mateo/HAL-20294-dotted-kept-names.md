# Decision: the action-result check and `requiredExpect` follow dotted kept names

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20294 (follow-up agreed in Julian's security review of #6725 on HAL-20289, under Liam's plan approval on HAL-17522, 27 Nov 01:03 UTC, point 2)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:FD+qbH3CyY2WN8l03Rbhg5MiJKD0ml7KFITBSVMIXRdCDH/vEASaQmFmWRFWDL3ydva9F3eZ+ok+udtlL2d/Bw==

## What changes

`ports.agent-messaging-actions` said the `action-result` check takes kept
fields "under plain names". Since #6725 the check calls `actionKeptProblem`
from `@halonicjs/events`, so it already takes the names `isActionKeptName`
allows: a plain name, or up to 3 of them joined by `.`. The requirement now
says so, and gains one example: `triggering_actor.login` is taken,
`pull_requests.0` and `a.b.c.d` are refused. No example or test is removed or
weakened.

`action-steppers.check-gate-request` said `routesOf` throws for a
`requiredExpect` field the check doesn't keep. It now also throws for a
dotted `requiredExpect` name, since a request's `expect` takes plain names
only, and gains one example for it. This is stricter than before; no catalog
step uses `requiredExpect` with a dotted name.

## Why

The requirement must say what the check lets into the requesting agent's
context. A dotted `requiredExpect` name would stop every request as
`missing-expect` at run time; the catalog's tests should catch it instead.

## Covers

- ports.agent-messaging-actions
- action-steppers.check-gate-request
