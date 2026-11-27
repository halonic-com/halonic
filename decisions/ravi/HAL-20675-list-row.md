# Decision: the sidebar rows are 72px with a 48px picture

- Task: HAL-20675
- Approval: Liam signs this note for HAL-20675 (build plan P2 on HAL-20617; Liam approved plan A on the task). A team decision on an approved plan.
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:1NtnBmMF5K/BqiTVcp14juY1ehpZTsI5ART3sg36pSoK9bt1RK5JqvCWblJDeVyfUtw5fX2THEFeD02o+oQtDQ==

## What changes

The Inbox's and the Messenger's sidebar rows (a `PlainList`'s rows and a `plain` `List`'s) go
from exactly 80px with 10px above and below to exactly 72px with 6px above and below, and their
picture (`Avatar size="sidebar"`, the loading rows' round block, the Messenger's channel pair) from
60px to 48px, as the new design's list row. The rows keep their 12px corners, their 15px title and
14px line, and their 60px text budget, so a `wrapTitle` title still takes two 20px lines over a
one-line meta line (`kit.plain-row-fit` keeps its rule). The unread count grows from 18px to the
new design's 20px badge. A row's text action and icon action move up 4px with the row's first line.

Requirements changed, each only in its sizes:

- `kit.plain-row-size`: 72px rows, 6px padding, 48px picture and skeleton block.
- `kit.plain-row-fit`: the rows it names are 72px; the 60px text budget stays.
- `kit.avatar-badge`: the 20px badge sits on the 40px or 48px tile.
- `inbox.header-avatar`, `inbox.notice-bell`, `inbox.proposal-page`, `inbox.row-meta-wraps`: the
  Inbox's rows are 72px and their pictures 48px.

Tests changed to the new values, none weakened, each still checking a fixed height, the padding and
the picture's size: the kit's `plain-row-size.test.tsx`, `list-plain-fit.test.tsx`,
`avatar-badge.test.tsx` and `plain-list.test.tsx` (the action's place), the Messenger's
`load-states.test.tsx` and `shared-layout.test.tsx`, and the Inbox's `inbox-row-wrap.test.tsx`,
`inbox-shared-look.test.tsx`, `notice-bell.test.tsx` and `row-marks.test.tsx`.

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
