# Decision: on a narrow phone row, the used-by text has the line alone

- Task: HAL-13648
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13648 (Sofia's team decision on the approved Library screen, HAL-2282 rule, no new words; Liam approves this note in review on the task)
- Kind: user-visible

## What changes

HAL-13066 made a phone row cut its description first and keep " · " and the used-by text whole. At
200 % zoom on a 390 px phone (195 CSS px) that wasn't enough: the description shrank to nothing, so
the line started with a stray " · ", and the used-by text itself was clipped at the cell's edge
("Not used ye"), with no ellipsis.

The requirement `shell.overview.used-by` now also says that when the row can't hold the used-by text
whole even with the description cut, the used-by text has that line alone, whole and wrapping if it
must, and the description and its " · " aren't shown on that row. The used-by text is never clipped
and no line starts with " · ". The description and its dot need at least 5rem before they show.
Wider rows don't change. The overview page is shared, so Agents and Workflows phone rows get the
same rule.

The unit test that checked the used-by text never wraps (`whitespace-nowrap`) now checks that it
isn't cut and may wrap, since a one-word-wider row must not clip it; a new unit test checks the
classes that hide the description, and a new browser test (`e2e/overview-phone-row.spec.ts`) checks
the real boxes at 390 px and 195 px. Nothing else is removed or weakened: the examples stay, and one
is added for 195 px.

## Why

The used-by text is the status people look for on the row; the description is already in full on
the item's page. A cut status is worse than a missing description, and a line starting with " · "
reads as broken. A screen reader still hears the whole line: the description stays in the page,
only clipped from view.

## Covers

- shell.overview.used-by
- packages/studio/shell/src/overview/overview-page.test.tsx
