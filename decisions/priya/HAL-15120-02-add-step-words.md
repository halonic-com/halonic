# Decision: a step's card is titled with its name, without "Step"

- Approval: /HAL/issues/HAL-15120 (C544 finding 10 in Iris's flow check HAL-15101; a small wording change on an approved screen, decided by the team under HAL-2282)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:jWCOb3IOb0aYbFo95ijX+L4sUTC3a6OLQtqJCM/a1bFx+xIxrUe9SLvAC+YE3/jLYPlFRV+TvjwoBqXtMDEhAQ==

The docked step card's title was "Step <id>", so a step added from the toolbar read "Step step-1", the doubled word #4382 meant to fix. The card is now titled with the step's name as its card on the canvas shows it: its title, else its id ("step-1", "write", "Writes the answer"). The breadcrumb under it keeps "<workflow> › <id>".

- workflows.page.step-card: the title sentence and two examples change from "Step write" and "Step done" to "write" and "done"; one example is added for a step with a title and a new step.
- workflows.canvas.toolbar: one example's "Step wait-2" becomes "wait-2". Nothing else changes.
- workflows.page.step-arrows: one example's "Step approve" becomes "approve". Nothing else changes.

No test is weakened: the assertions on the title now expect the new words, and a new unit test covers a step with a title.

## Covers

- workflows.page.step-card
- workflows.canvas.toolbar
- workflows.page.step-arrows
