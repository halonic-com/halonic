# workflows.start.dock-close-focus

- Status: draft
- Since: unreleased
- Source: HAL-13679 (a11y check HAL-13658, row DK1; WCAG 2.4.3); decided by the team under HAL-2282

When a card docked on the workflow page closes (the start card, the dock's waiting line or the run's card), whether by Escape, **Cancel**, **Close** or **Close run**, the workflows feature shall move focus to the page's **Run** button, the one that opened it, or to the page's heading when the page has no **Run** button. A step's card keeps its own rule and gives focus back to its step.

## Examples

- Given the person opened the start card with **Run**, when they press Escape, then focus is on **Run**, not on the page's body.
- Given the start card, when the person presses **Cancel** or **Close**, then focus is on **Run**.
- Given **Start run** docked the run's card, when the person presses Escape or **Close run**, then focus is on **Run**.
- Given the dock's line "Run started. Waiting for it to appear…", when the person presses its **Close**, then focus is on **Run**.
