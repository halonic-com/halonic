# Decision: the sidebar rows are 72px with a 48px picture

- Task: HAL-20675
- Approval: Liam signs this note for HAL-20675 (build plan P2 on HAL-20617; Liam approved plan A on the task). A team decision on an approved plan.
- Kind: user-visible

## What changes

The Inbox's and the Messenger's sidebar rows (a `PlainList`'s rows and a `plain` `List`'s) go
from exactly 80px with 10px above and below to exactly 72px with 6px above and below, and their
picture (`Avatar size="sidebar"`, the loading rows' round block) from 60px to 48px, as the new
design's list row; the rows' height is the theme's `--spacing-row` (`h-row`). A Messenger channel's
picture in a row is the header's 40px pair centred in the 48px place, so its tiles still overlap. The rows keep their 12px corners, their 15px title and
14px line, and their 60px text budget, so a `wrapTitle` title still takes two 20px lines over a
one-line meta line (`kit.plain-row-fit` keeps its rule). The unread count grows from 18px to the
new design's 20px badge. A row's text action and icon action move up 4px with the row's first line.

Requirements changed, each only in its sizes:

- `kit.plain-row-size`: 72px rows, 6px padding, 48px picture and skeleton block.
- `kit.plain-row-fit`: the rows it names are 72px; the 60px text budget stays.
- `kit.avatar-badge`: the 20px badge sits on the 40px or 48px tile.
- `inbox.header-avatar`, `inbox.notice-bell`, `inbox.proposal-page`, `inbox.row-meta-wraps`: the
  Inbox's rows are 72px and their pictures 48px.
- `studio-click-test.sidebar-row-size`: the click test's Inbox and Messenger steps pass a 72px row
  with a 48px picture, not 80px and 60px. Step 9 also names `inbox.header-avatar` and
  `inbox.proposal-page`, whose changed examples it measures.

Tests changed to the new values, none weakened, each still checking a fixed height, the padding and
the picture's size: the kit's `plain-row-size.test.tsx`, `list-plain-fit.test.tsx`,
`avatar-badge.test.tsx` and `plain-list.test.tsx` (the action's place), the Messenger's
`load-states.test.tsx` and `shared-layout.test.tsx`, and the Inbox's `inbox-row-wrap.test.tsx`,
`inbox-shared-look.test.tsx`, `notice-bell.test.tsx` and `row-marks.test.tsx`, and the click
test's `sidebar-row-size.test.ts`. Four tests gain checks: `plain-list.test.tsx` (the 20px badge),
`list-plain-action.test.tsx` and `list-plain-action-icon.test.tsx` (the actions' places) and the
Messenger's `channel-picture.test.tsx` (the row's pair sizes; its header test no longer says
"smaller", since both pairs are now 40px).

## Why

The board picked the new design for the whole Studio (HAL-20617), and its list row is 72px with a
48px picture. The board's 80px rows of HAL-20557 came earlier the same day; the new design replaces
them. One kit row keeps the Inbox and the Messenger alike, as the build plan asks.

## Covers

- kit.plain-row-size
- kit.plain-row-fit
- kit.avatar-badge
- inbox.header-avatar
- inbox.notice-bell
- inbox.proposal-page
- inbox.row-meta-wraps
- packages/studio/kit/src/plain-list/plain-row-size.test.tsx
- packages/studio/kit/src/plain-list/plain-list.test.tsx
- packages/studio/kit/src/list/list-plain-fit.test.tsx
- packages/studio/kit/src/avatar/avatar-badge.test.tsx
- packages/studio/features/messenger/src/ui/load-states.test.tsx
- packages/studio/features/messenger/src/ui/shared-layout.test.tsx
- packages/studio/features/inbox/src/ui/inbox-row-wrap.test.tsx
- packages/studio/features/inbox/src/ui/inbox-shared-look.test.tsx
- packages/studio/features/inbox/src/ui/notice-bell.test.tsx
- packages/studio/features/inbox/src/ui/row-marks.test.tsx
- studio-click-test.sidebar-row-size
- packages/testing/studio-click-test/src/steps/sidebar-row-size.test.ts
- packages/studio/kit/src/list/list-plain-action.test.tsx
- packages/studio/kit/src/list/list-plain-action-icon.test.tsx
- packages/studio/features/messenger/src/ui/channel-picture.test.tsx
