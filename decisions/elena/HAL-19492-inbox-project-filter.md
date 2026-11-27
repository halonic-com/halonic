# Decision: the Inbox's project filter takes one line, with a "+N" menu

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19492
- Kind: user-visible

The board approved the HAL-19192 sketches, whose question 4 is projects that fit: with five
projects, today's filter chips wrap to four lines. Sketches A and C there put the filter on one
line: "All", the projects that fit, then "+N", a menu of every project with its count; a picked
project stands alone after "All" with a ×. This pull request builds it (`inbox.project-line`).

`inbox.project-filter` said the person keeps the list to one project "in one click". A project
that doesn't fit on the line now sits in "+N", two clicks away, so the requirement now says one
click for a choice on the line, or two from its menu. Everything else in it, the choices, "No
project" and how it combines with All and Waiting for me, is unchanged.

`inbox.project-dot`'s Source line now also names HAL-20307, the design check that took the dot
colours from the brief's six to five. The design check of this pull request (HAL-20370) then
dropped `series-2`: its rose is the Studio's "failed", which on an agent's item reads as an
alarm, and no free strong hue is left in the theme to replace it. So the rule now says four
colours, none the rose of failed, and its test expects four. Its examples are unchanged.

Four existing test files change, and none checks less:

- `src/ui/project-dot.test.tsx` (`inbox.project-dot`): it expects four colours, not five, and
  now also checks that `bg-series-2` is never picked.
- `src/ui/project-filter.test.tsx` (`inbox.project-filter`): the chips are now buttons on one
  line, a fieldset named "Project", not a radio group, so the test reads `fieldset > button` and
  picks a choice from the line or else from "+N"'s menu. "All projects" is now "All projects, 4",
  its count. The test still filters by Website, by No project and back to all, with the same
  items listed each time, and still finds no filter while no item has a project.
- `src/agent/project-filter.test.ts` (`inbox.project-filter`): `projectChips` takes how many of
  the Inbox's own items wait instead of whether any do, so its second argument is `0`, not
  `false`. Its expectations are unchanged.
- `src/ui/agent-bundle-projects.test.tsx` (`inbox.project-filter`): it presses the Website chip,
  now a button on the line, instead of the radio inside its label. What it checks after, that a
  bundle holds only Website cards, is unchanged.

## Covers

- inbox.project-filter
- inbox.project-dot
- packages/studio/features/inbox/src/ui/project-dot.test.tsx
- packages/studio/features/inbox/src/ui/project-filter.test.tsx
- packages/studio/features/inbox/src/agent/project-filter.test.ts
- packages/studio/features/inbox/src/ui/agent-bundle-projects.test.tsx
