# Decision: an agent's card of several questions has one scroll area and a pinned foot

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-21255 (follow-up to #6982, from Noah's look check on HAL-21253). Liam approves the change in review on HAL-21255.
- Kind: user-visible
- Signature:

## What changes

`inbox.card-bar-reach` (unreleased, from #6982): an agent's card that asks several questions no longer has two scroll areas, its body and a bar of answers capped at half the window. The body is the card's one scroll area and holds the questions; a foot under it never scrolls and holds only the reason or failure line and **Submit**. The half-window cap goes. In a short window the item pane still scrolls the whole card, and the failure line sits directly above **Submit**.

Tests changed to follow:
- `card-surface.test.tsx` drops its two `inbox.card-bar-reach` tests, which checked the bar's `max-h-[50dvh]` cap and its own scrolling, the layout this change replaces.
- `card-bar-reach.test.tsx` takes their place with two tests on the click test's item verdicts card after a failed send: the card has one scroll area, which holds both questions; **Submit** and the failure line are in the foot, outside it, with the questions scrolled to the top and to the bottom; the failure line is the alert directly above **Submit**; and in a short window nothing in the card scrolls on its own.

New: `kit.question-form-arrange`, with two tests in `question-form.test.tsx`. No other test was skipped or weakened.

## Why

Noah's look check of #6982 at 800x600: a failed send's line showed at the bar's top, out of view when the bar was scrolled to **Submit**, so the card looked unchanged after **Submit**; the cap counted the window, not the card's room, and cut **Submit**'s bottom 16px at rest; and neither of the two scroll areas showed that it scrolls.

## Covers

- inbox.card-bar-reach
- packages/studio/features/inbox/src/ui/card-surface.test.tsx
