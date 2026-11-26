# Decision: the Inbox's rows say which items are new, and its heading counts them

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19492
- Kind: user-visible

The read and unread rule the board approved on HAL-19192 (Sofia's sketches of 26 Nov, 07:58 and
09:08) now reaches the Inbox (`inbox.read-marks`, new): an item nobody opened has the unread row
(`kit.list-plain`: a semibold title, a full-colour line, a blue dot and "unread" after its name for
a screen reader), opening it marks it read, and the Needs you heading adds "· 3 new" between how
many wait and how many are late. In a test's fresh Inbox every item is new, so five existing test
files that compare a row's whole text or the heading's name now see those words. Their expected
values gain the new words and nothing else; each still checks all it checked before:

- `inbox-page.test.tsx` (`inbox.page`): the rows end with "unread", and the heading reads "Needs
  you, 2 waiting, 2 new", "Needs you, 2 waiting, 2 new, 1 late" and "Needs you, 1 waiting, 1 new".
- `setup-row.test.tsx` (`inbox.setup-items`) and `inbox-row-names.test.tsx` (`inbox.page`): the
  rows end with "unread", before the Setup chip on the setup row.
- `needs-you-card.test.tsx` (`inbox.home`): Home's Needs you rows still equal the page's, once the
  page's "unread" is taken off; Home's card doesn't say what is new.
- `inbox-row-wrap.test.tsx` (`inbox.row-meta-wraps`): the unread mark wraps the row's line in a
  span with the same text, so `spanWith` takes the innermost such span, the line itself, and the
  tests still check what they checked.

Two active requirements whose words those tests check say so too: `inbox.page` names Needs you
"Needs you, 2 waiting, 2 new" in its rule and its example, and `inbox.home` says Home's Needs you
shows the page's rows without the unread mark, since Home doesn't say what is new. Nothing else in
either changes.

The pull request also fixes the second example of `inbox.header-avatar`, which Nora's review of
#6615 found didn't match its test: the test opens an approval next to a person step and sees
"1 of 2", not the second of two approvals and "2 of 2"; "1 of 2" now sits before the new ··· button
rather than at the header's end. The rule itself doesn't change. The plan
was approved by Liam on HAL-19492.

## Covers

- inbox.header-avatar
- inbox.page
- inbox.home
- packages/studio/features/inbox/src/ui/inbox-page.test.tsx
- packages/studio/features/inbox/src/ui/setup-row.test.tsx
- packages/studio/features/inbox/src/ui/inbox-row-names.test.tsx
- packages/studio/features/inbox/src/ui/needs-you-card.test.tsx
- packages/studio/features/inbox/src/ui/inbox-row-wrap.test.tsx
