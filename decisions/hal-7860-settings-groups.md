# Decision: the phone's Settings list gets its groups, summaries and kept scroll

- Approval: Liam decided this on [HAL-7939](/HAL/issues/HAL-7939), the review of HAL-7860 (HAL-7832 part 2); the requirement now says what the board-approved flow-settings 13 already shows, a team decision with no board card (HAL-2282 rule)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/an01XtNGFUBNbA1agUg3OeI78NiQ4tafy/rDpjLgoX3sZ8suVvNksZeeDmSZ3aHFxEs4bvKiyAB5JMpqu1VBw==
- Task: HAL-7860

## What changes

`shell.settings-list-page` described part 1's plain list: every section, in desktop order, as a
row with a chevron. Part 2 builds the rest of flow-settings 13, and the requirement now says so:

- The list is headed "Acme · workspace settings" (only with a workspace open), "On this phone"
  and "On your computer". These phone headings are for the served Studio only; a narrow desktop
  app window keeps "On this computer".
- Each row has an icon, the section's name, its one-line summary when it has one, and a chevron.
- A section with `phone: false`, such as Developer, is never listed, and `openSettings(id)` does
  not open it either.
- Back from a section returns to the list scrolled where it was.

Two examples are added, for the headings and summaries and for the kept scroll. No example is
removed. The tests that name the requirement assert the new list word for word; the old
row-names check became the stricter grouped one, and the scroll is checked in Chromium and WebKit
(`e2e/settings-list.spec.ts`).

## Covers

- shell.settings-list-page
