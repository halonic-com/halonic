# Decision: the Inbox's rows show their wait at the top right and who asks, as the approved design does

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20396
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Vp5sP5zrTLQp35IJIrG68NsCW3riwMRX5w3rSoOUlcgv360ZbzqB1kM0nmLY6RgC0CpyBl7bkgJ/BGtDYVBuBA==

The board approved the HAL-19192 sketches for the Inbox. Sofia's final design check of the built
Inbox (HAL-20395) found that its rows differ from them: the wait sat at the end of the second line
("· Waiting 2 min"), with a "Late" chip at the top right, and an agent's row named the project, the
source, who asks and the wait, so at 360 px who asks was always cut away. Sketch D and the
Messenger put the time at the top right ("2 min", amber with a dot when late) and keep the second
line to "project · who asks". This pull request builds that, with Sofia's other fixes (HAL-20396).

Requirements that change, each only where the row's layout changed:

- `inbox.waiting-time` (released in 0.1.0): the row says "1 min" at its top right, heard as
  "Waiting 1 min"; a late item's time is amber with a dot and heard with ", late", where the rule
  said "`warning` text". The card's "Waiting since …" lines are unchanged.
- `inbox.page`: a row shows its wait at the top right and its run's line under the title, so the
  examples read "Support reply · run 891b5a · a person step" with "1 h" at the top right.
- `inbox.row-meta-wraps`: the line no longer holds the wait, so the Inbox's one-line row cuts the
  whole line; the wait stays whole at the top right. Home's line still wraps onto two lines.
- `inbox.home`: its example follows the Inbox's row, as the rule says it must.
- `inbox.project-dot`: an agent's row reads "Studio app · Chief", without the source, which the
  open item's header still names (that example now says the header's whole line). The dot takes
  one of three colours, not four: `series-1` is the blue of the unread dot, so a row showed two
  identical blue dots that meant different things (Sofia's fix 8). The theme has no other free
  strong hue, so it is dropped, not replaced.
- `inbox.agent-inbox-items`: the source's label moves from the row to the open item's header; the
  example opens the item to find it.
- `inbox.read-marks`: the heading's late count counts the agents' items too, as their rows show
  them late (Sofia's fix 5). Nothing else in it changes.

A new requirement, `inbox.item-steps`, records the header's up and down buttons and K and J
(note 2 of the sketches).

Ten existing test files change, and none checks less:

- `src/ui/inbox-page.test.tsx` (`inbox.page`): two rows' text has the wait after the line, not
  in it; the late test checks the amber time with its dot and ", late" in place of the "Late"
  chip, and still checks the heading's "1 late"; the heading test also checks its sidebar style.
- `src/ui/inbox-row-names.test.tsx` (`inbox.page`): the two rows' text has the wait after the
  line; they are still told apart by their run ids.
- `src/ui/needs-you-card.test.tsx` (`inbox.home`): the same change to Home's two rows; it still
  checks that Home and the Inbox read the same.
- `src/ui/inbox-row-wrap.test.tsx` (`inbox.row-meta-wraps`): it checks the one cut line and the
  whole wait in the row's end column, and that the header's line has the wait whole, in place of
  the line's split end.
- `src/ui/plan-limit-card.test.tsx` (`inbox.plan-limit-card`): the row's line is "Support reply ·
  run r51", still without "a person step"; the wait is no longer part of it.
- `src/plain/proposal-text.test.ts` (`inbox.proposal-items`): `lateCount` takes the agents'
  items too, so it gets an empty list; it still expects 0.
- `src/ui/project-dot.test.tsx` (`inbox.project-dot`): rows read "Studio app · Chief" and no
  longer "Paperclip"; the first test now also opens the item and checks the header's whole line
  with the source and the wait; the colour test expects three colours and never `series-1`.
- `src/ui/agent-items.test.tsx` (`inbox.agent-inbox-items`): it finds the wait in the row's time
  and now also opens the item to find "Paperclip · Acme · Chief · Waiting 3 h" in its header.
- `src/ui/agent-bundles-media.test.tsx` (`inbox.agent-item-bundles`): the bundles' rows read who
  asks and the oldest card's wait, "Chief · Waiting 3 h" without the source.
- `src/ui/request-form.test-helper.tsx` (`inbox.request`): **New request** is an icon button on a
  desktop, so its `button` helper also finds a button by its name; every test finds the same
  buttons as before.

## Covers

- inbox.waiting-time
- inbox.page
- inbox.row-meta-wraps
- inbox.home
- inbox.project-dot
- inbox.agent-inbox-items
- inbox.read-marks
- packages/studio/features/inbox/src/ui/inbox-page.test.tsx
- packages/studio/features/inbox/src/ui/inbox-row-names.test.tsx
- packages/studio/features/inbox/src/ui/needs-you-card.test.tsx
- packages/studio/features/inbox/src/ui/inbox-row-wrap.test.tsx
- packages/studio/features/inbox/src/ui/plan-limit-card.test.tsx
- packages/studio/features/inbox/src/plain/proposal-text.test.ts
- packages/studio/features/inbox/src/ui/project-dot.test.tsx
- packages/studio/features/inbox/src/ui/agent-items.test.tsx
- packages/studio/features/inbox/src/ui/agent-bundles-media.test.tsx
- packages/studio/features/inbox/src/ui/request-form.test-helper.tsx
