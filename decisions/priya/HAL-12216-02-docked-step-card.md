# Decision: the canvas toolbar's Step and Wait are heard as "Add step" and "Add wait"

- Task: HAL-12216
- Approval: C285 TB1, decided by the team on HAL-14002 and checked by Sofia in C296 (HAL-14032); Liam approves this note in review
- Kind: user-visible

## What changes

- `workflows.canvas.toolbar`: the toolbar's **Step** and **Wait** buttons keep their text on screen, and a screen reader now hears them as "Add step" and "Add wait". The requirement says so, and its first example lists the names heard.

Nothing is removed or weakened: what the buttons do, where they are and what they show stay the same.

## Why

Sofia's UX and accessibility check C285 (TB1) found that "Step" and "Wait" alone don't say what pressing them does. The names heard now say it, while the short text keeps the toolbar small.

## Covers

- workflows.canvas.toolbar
