# Decision: on a stacked List row's third line, only the text columns are cut, never the short id or the time

- Task: HAL-12829
- Approval: team decision on an approved screen under the HAL-2282 rule (Sofia, on HAL-12829); the reviewer of the pull request on HAL-12829 signs this note
- Kind: user-visible

## What changes

On a phone, or below 800px, a List row with columns stacks them, and its third line joins the other columns with " · ", as the Runs list's "01JD9A · A message arrived · 10:44". That line used to be cut at its end, so a long Started by pushed the time out. Now only the `text` columns give way, each cut with an ellipsis; the `code` (short id) and `time` values are never cut, as in the side-by-side layout. The order and the words don't change.

On the Runs list, a schedule's Started by, which has the routine's name in a tooltip, is now plain inline text with `useTooltip` rather than inside `Tooltip`'s `inline-flex` wrapper, which can't be cut part way and would have shown as "…" alone.

The `kit.list-columns` requirement says so and gains one example. No test was weakened or skipped.

## Why

The UX check C79 (HAL-12817) found a phone's Runs row reading "… Weekly report routine, with Run now · 11:…" once a routine's Run now names the routine (HAL-12406). A longer routine or schedule name would hide the time completely, and the time is what a user scans the list by. Sofia decided to keep the order and let the Started by text be the part that's cut.

## Covers

- kit.list-columns
