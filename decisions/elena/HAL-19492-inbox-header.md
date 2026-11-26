# Decision: the Inbox's 40px picture moves from the agent's card to the header over the open item

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19492
- Kind: user-visible

`inbox.header-avatar` said the Inbox shows the asker's 40px picture inside an agent's card, before
the line that says who asks and the title. The Inbox and Messenger layout the board approved on
HAL-19192 (Sofia's sketch J) puts the Messenger's content header over every open item instead:
its row's picture at 40px (the agent's, or the item's own mark: the stamp, the pause, the gear or
the question mark), the item's title over its row's line, and its place among what waits. So the
requirement now says that, and the card keeps who asks over its title without a second picture.
One picture changes on the way: a question from a person, not an agent, had their initials at
40px in the card, and now has its row's question mark (`inbox.row-marks`) in the header.
The requirement is still unreleased. The plan was approved by Liam on HAL-19492.

Sofia's design check (HAL-19913) added two lines to it. With one pane, **Back to Inbox** becomes
sketch E's back arrow, an icon button whose name and tooltip stay "Back to Inbox", so a phone's
title keeps about 75px more; the requirements that name **Back to Inbox** still hold, since that is
the button's name. Once an agent's item is answered, the header's line ends at who asks, without
the wait, as its place already goes.

Nora's review added the rest of that rule: a bundle's header names what in it still waits, and an
approval or person step that you decided, or whose run moved on, keeps its run in the header's line
but drops the wait, as its card no longer says since when it waits (`inbox.wait-card`).

The pull request also moves the eight phone tests of `inbox-page.test.tsx` (the "on a phone"
group of `inbox.page`), unchanged, to `inbox-page-phone.test.tsx`, so the file stays under 480
lines. No test is weakened or dropped: the same eight run there under the same requirement.

## Covers

- inbox.header-avatar
- packages/studio/features/inbox/src/ui/inbox-page.test.tsx
