# Decision: a new Inbox row says "new" to a screen reader, and a fixed setup item keeps its dot

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19492
- Kind: user-visible

Two follow-ups to `inbox.read-marks` (#6648), which isn't released yet:

- Nina's words check on HAL-19492 found that a new row said "unread" to a screen reader while the
  Needs you heading counts the same rows as "new". The row now says "new" too. **Mark as unread**
  keeps its name, which Nina checked as fine.
- Nora's review of #6648 found that a fixed setup item nobody opened had lost its blue dot, because
  it no longer waits and only rows that wait were looked up. Every listed row of the Inbox's own
  now goes by its read key, so it keeps the dot until it is opened, as the rule says ("while an item
  in Needs you hasn't been opened"). It still isn't counted in "N new", which counts what waits.

Five test files compare a row's whole text, which ended in "unread" and now ends in "new". Their
expected values change by that word and nothing else, and each still checks all it checked before:
`inbox-page.test.tsx` and `inbox-row-names.test.tsx` (`inbox.page`), `setup-row.test.tsx`
(`inbox.setup-items`), `needs-you-card.test.tsx` (`inbox.home`, which takes the word off the page's
rows) and `read-marks-page.test.tsx` (`inbox.read-marks`). A new test there covers the fixed setup
item.

## Covers

- inbox.read-marks
- packages/studio/features/inbox/src/ui/inbox-page.test.tsx
- packages/studio/features/inbox/src/ui/inbox-row-names.test.tsx
- packages/studio/features/inbox/src/ui/setup-row.test.tsx
- packages/studio/features/inbox/src/ui/needs-you-card.test.tsx
- packages/studio/features/inbox/src/ui/read-marks-page.test.tsx
