# Decision: a parallel branch is offered only connector tools that read

- Approval: [HAL-3989](/HAL/issues/HAL-3989), the follow-up to HAL-1532 that asks for this; the package owner approves this note in review
- Kind: internal
- Task: HAL-3989

## What changes

`engine.parallel-state` gains one sentence and one example: where the executor is given connector
calls, a branch's model call offers only the connector tools whose listing says they read. A tool
labelled `write` or `send`, or whose listing gives no risk, is left out of a branch's call.

## Why

A run records one effect at a time, so a branch that calls a tool that can change things already
ends with an error (the requirement's last example). Offering such tools in a branch only invited
the model to make a call that was bound to fail. Leaving them out changes no outcome the
requirement already describes: that example still holds for a branch whose agent asks for a tool
by name. Calls outside a branch are offered the same tools as before.

## Covers

- engine.parallel-state
