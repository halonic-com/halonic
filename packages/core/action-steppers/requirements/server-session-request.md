# action-steppers.server-session-request

- Status: active
- Since: unreleased
- Source: stream HAL-17488; board requirement "Run with Claude" for server-session Inbox items (HAL-10, 24 Nov), task HAL-17834 and its approved plan, section 1

When a `halonic.stepper-request/1` document holds a `server-session` block, the action-steppers package shall take it only when that block is the request's only block, its task id matches `^HAL-[0-9]{1,7}$` (deliberately stricter than `^HAL-[0-9]+$`, so the brief's file name on the server stays short), it lists 1 to 20 steps of at most 300 characters and a "Done when" of at most 500 characters, each one line of plain text without a control character, and no step or "Done when" holds text shaped like a key. A taken request shall have the risk `irreversible`, so the user's requester policy blocks it unless the user allowed that requester, and touch the server task it names. `stepperBlockSchema`, the block schema ToolScript's header reuses, shall never take a `server-session` block.

## Examples

- Given a request whose only block is a `server-session` block for `HAL-1234`,
  when it is validated,
  then it is taken with the risk `irreversible` and the target `server` task `HAL-1234`.
- Given a request with a `server-session` block and a `browser` block,
  when it is validated,
  then it is refused with "a server-session block must be the request's only block".
- Given a `server-session` block for the task id `HAL-1;x`, `hal-1` or `HAL-12345678`,
  when it is validated,
  then it is refused with a reason naming block 1.
- Given a step that holds a line break or text shaped like a key,
  when it is validated,
  then it is refused, and the reason doesn't echo the key.
- Given a ToolScript header step with `kind: "server-session"`,
  when `stepperBlockSchema` parses it,
  then it is refused.
