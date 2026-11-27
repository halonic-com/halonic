# Decision: the sidebar's Inbox counts what's new, not all that waits

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19492
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:dccNsZKnIMSZuOleEYu9clUwD7I9ovnBI6pilOwOXOQrZP/A/BnwVa3G5qUcspTjz/3ywNk1LePDBSk83gmdDg==

The read and unread rule the board approved on HAL-19192 has the sidebar show how many items are
**new**, and Sofia's sketch G there and her acceptance rows A3.1 and A3.2 on HAL-20100 spell it
out: "3", not "8", with the name semibold, heard as "Inbox, 3 new, 8 waiting", and no number with
a regular name while nothing is new. This pull request builds it, through a new `new` place
signal in the shell (`shell.place-new-signal`) and the Inbox's new count (`inbox.sidebar-new`).
Home's Needs you keeps counting every item that waits (`inbox.count` is unchanged).

`inbox.page` said the place's signal is the Inbox's count, heard as "Inbox, 2 waiting". It now
says the signal is how many of the Inbox's own items are new (an agent's cards count only on the
page, until HAL-20250), heard as "Inbox, 2 new, 2 waiting", and that the sidebar reads it again
when a read mark changes too; its example reads "Inbox, 1 new, 1 waiting".

One existing test changes:

- `inbox-page.test.tsx` (`inbox.page`, "adds the Inbox place, whose count is the workspace
  Inbox's and follows it"): the place's first signal is now
  `{ mark: "new", value: 1, spoken: "1 new, 1 waiting" }` instead of
  `{ mark: "count", value: 1, spoken: "1 waiting" }`. The item nobody opened is new, so the value
  is the same; the rest of the test, that the signal follows the Inbox, is unchanged.

## Covers

- inbox.page
- packages/studio/features/inbox/src/ui/inbox-page.test.tsx
