# Decision: the sidebars' rows are exactly 80px, not at least 80px

- Approval: /HAL/issues/HAL-20558
- Kind: user-visible

## What changes

- `kit.plain-row-size`: the Inbox's and the Messenger's sidebar rows, and their loading rows, are
  "exactly 80px" instead of "at least 80px", in the text and in its five 80px examples. One new
  sentence says a plain `List`'s row that wraps, shows an error's reason, has a part under its meta
  line or has text buttons may grow past 80px. #6673 (HAL-20019) already built that exception, so
  such a row never spills over the next one. The Inbox and the Messenger use none of these.
- `packages/studio/kit/src/plain-list/plain-row-size.test.tsx`: the `PlainRow` test and the
  plain `List` loading-rows test check for a fixed `h-20` and no `min-h-20`. Before, they checked
  for `min-h-20`. This makes the tests stricter.
- `packages/studio/features/messenger/src/ui/load-states.test.tsx`: the Messenger's loading row
  test checks for `h-20` and no `min-h-20`. This also makes it stricter.

## Why

On 27 Nov the board's brief on HAL-20557 asked for sidebar rows that are exactly 80px, padding
included, after it measured taller rows in Preview .440. #6673 fixed the height of the plain
`List`, which draws the Inbox's rows. `PlainRow`, which draws the Messenger's chats, and both
loading-row skeletons stayed at "at least 80px", so a Messenger row could still grow.

## Covers

- kit.plain-row-size
- packages/studio/kit/src/plain-list/plain-row-size.test.tsx
- packages/studio/features/messenger/src/ui/load-states.test.tsx
