# Decision: the spend line drops its parts from the right in a narrow window

- Task: HAL-10387
- Approval: Sofia's design check of #2941 on HAL-10387 (https://paperclip.halonic.com/HAL/issues/HAL-10387) asks for it: "Narrow window: drop parts right to left, keeping "Est. this run €0.15"; the full text in the tooltip." It builds on flow-models 5, which the board approved. A team decision with no board card (HAL-2282 rule).
- Kind: user-visible

## What changes

In a narrow window the status bar spend line is cut part by part from the right instead of being clipped mid-word: first the month, then "+ N calls without a price", then "of €5.00", and "Est. this run €0.15" stays. The tooltip says the full line before the estimate note. The requirement `models.spend.month-line` drops "cutting the line short in a narrow window" from what is not done yet and states the rule, with one new example. The tests for it are in `spend-item.test.tsx`. No test was weakened or skipped.

## Why

A clipped line could end in the middle of an amount. Dropping whole parts keeps what is shown true, and the tooltip keeps the rest reachable.

## Covers

- models.spend.month-line
- packages/studio/features/models/src/spend/spend-item.test.tsx
