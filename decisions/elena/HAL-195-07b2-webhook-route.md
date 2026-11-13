# Decision: webhook facts refuse listed secret headers and big bodies, and the server interface gains `WebhookRoutines`

- Approval: the package owner (Liam) approves this in review of #2455 on HAL-8512; the build plan for HAL-195 was approved by Liam on HAL-7816
- Kind: internal
- Task: HAL-195

## What changes

`routines.webhook-facts` gains two limits. A header on the format's refused
list (`authorization`, `cookie` and the like) never reaches the run, even when
a trigger lists it. A body of more than 256 KiB is never parsed and stays text.
Two examples cover them.

`server.api` names one more export: `WebhookRoutines`, the port that finds the
routine at a webhook address. Nothing is renamed or removed.

## Why

The webhook route (HAL-195, PR 7b) is the first caller that takes a request
from outside. The file check already refuses those headers, but a trigger built
in code skips it, so the facts refuse them too. The size limit keeps a large
body from costing a parse on every request. The route needs to find a routine
by its address without the server knowing about workspaces, so that comes in
through a port, like every other outside dependency.

No test was weakened.

## Covers

- routines.webhook-facts
- server.api
