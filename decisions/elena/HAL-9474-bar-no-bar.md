# Decision: MonthBars gets an explicit hidden month instead of the negated-value trick

- Task: HAL-9474
- Approval: Liam asked for this change on HAL-9474 (follow-up to his review of #2696); the package owner (Liam) approves this note in review
- Kind: internal

## What changes

`kit.month-bars` gains one sentence: `MonthBars` draws no bar for a month marked hidden, though its
value is still written as text. One example was added for it. `spendTile` now marks a month under
EUR 0.005 hidden instead of negating its value, so the tile no longer depends on how the kit draws
a negative value. The words on the tile ("under EUR 0.01") are unchanged.

No example was removed or weakened. The negative-value example stays.

## Why

The negated value worked only because the kit happens to draw a negative as no height. A kit that
draws refunds, or scales from the minimum, would have broken the tile without any error. The
requirement only adds behaviour that nothing used before.

## Covers

- kit.month-bars
