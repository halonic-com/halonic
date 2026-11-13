# Decision: a List with columns gets an optional child row

- Requirement: `kit.list-columns` (`packages/studio/kit/requirements/list-columns.md`)
- Task: HAL-8173, a follow-up from the review of #2364 (HAL-8165)
- Approval: Liam approves it in review of #2372
- Kind: internal

## What changes

A row may now set `child: true`. It is indented 24px in both layouts and its
`label` is then required, so the screen has to name the parent step. The
requirement text gains the rule and an example. Rows without `child` render as
before.

## Why

Branch and for-each rows under a step looked like steps, and a screen reader had
nothing to tell it they belong to one. The kit has no wording of its own for
this; the screen supplies the label.

No existing rule or test was weakened or removed. One test was added.

## Covers

- kit.list-columns
