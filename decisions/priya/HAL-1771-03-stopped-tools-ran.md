# Decision: a stopped answer says whether a tool ran

- Requirement: `app.chat-stop` (`packages/core/app/requirements/chat-stop.md`)
- Task: HAL-1771, a follow-up from the review of HAL-1539
- Approval: the maintainer asked for this change in HAL-1771 and approves this note in review

## What changes

1. **`ChatAnswerEnd` of reason `stopped` gets `toolsRan`**, as `failed` already has. It is true
   when a tool was called in the answer before the stop, even one that then failed.
2. **The requirement says so**, and gains an example: a tool ran, the person stops during the next
   model turn, and the answer says a tool ran.

## Why

After Stop, the Studio needs the same "Try again" rule as after a failure: sending the message again
is safe only when no tool ran, since a tool may have changed something.

## What stays

Nothing the requirement promised is taken away. Stop still starts no further turn or tool call,
drops a late answer, gives the calls left "Not run: the person stopped the chat." and keeps the
messages added before it.

## Tests

The `app.chat-stop` tests that compared the end with `{ reason: "stopped" }` now compare it with
`toolsRan` included, `true` where a tool ran before the stop and `false` where none did. That makes
them stricter, not weaker. No test was dropped.
