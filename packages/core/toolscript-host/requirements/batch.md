# toolscript-host.batch

- Status: active
- Since: unreleased
- Source: stream HAL-17560 (ToolScript); ADR on HAL-17560, section 3.2 (S9); task HAL-17570

When a script calls `ctx.batch` with a list of `{ use, args }` items, the toolscript-host package shall check and freeze every item, confirm them all with one `confirm` call, and then send them in order; and shall refuse the batch before `confirm` with `toolscript.irreversible-in-batch` if any item is `irreversible`, with `toolscript.bad-argument` if an item is a read or a capability the script doesn't use, or with `limit.calls` if the calls already sent plus its items go over the run's call limit.

## Examples

- Given a batch of two routine writes,
  when the person confirms it,
  then `confirm` was asked once with both writes and both are sent in order.
- Given a batch with one irreversible write,
  when it is called,
  then the run stops with `toolscript.irreversible-in-batch` and nothing is confirmed or sent.
