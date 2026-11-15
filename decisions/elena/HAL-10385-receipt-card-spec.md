# Decision: the run card keeps the receipt's banner and Every step, and says what the spec says

- Task: HAL-10385 (follow-up to HAL-8395 PR 6, #2958)
- Approval: Sofia's design check on HAL-10385 (/HAL/issues/HAL-10385): the design lead's call on a small detail of an approved screen (HAL-2282 rule), no board card
- Kind: user-visible
- Supersedes: the sentence "Every step is the place for the steps" in `HAL-8395-06-receipt-card.md`

## What changes

- `workflows.runs.card-receipt`: the card shows the run's banner and Every step (with **Show the run log**) under its header, not only the summary and the sections. While the log is read it says "Loading run 01jd8q" with no status chip; when it can't be read it says "Couldn't load run 01jd8q", why, and **Try again**. The footer link says **Show the run log** once the receipt shows and **Open the run log** on the fallback card.
- `workflows.runs.runs-view`: no change to its text.

Nothing is removed or weakened. The test expectations that named "Couldn't read this run's log" and "Loading the run" now name the words above, and tests for the banner, Every step and Try again are added.

## Why

The earlier note said Every step moves to the run page only. That dropped an approved part of the design (G5 decision 34, T8-F14 to F16) without a card. The design lead decided the card keeps the spec and reuses the run page's pieces at card width.

## Not on the card yet

"What the agent says" and **Show on canvas** aren't built on the run page either (T7), so the card has neither; they arrive on both together. A step's row and **See the step** open the run page, because the card has no room for the step panel beside it.

## Covers

- workflows.runs.card-receipt
