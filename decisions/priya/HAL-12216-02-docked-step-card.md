# Decision: the canvas toolbar's Step and Wait are heard as "Add step" and "Add wait", and open the new step's card

- Task: HAL-12216
- Approval: C285 TB1, decided by the team on HAL-14002 and checked by Sofia in C296 (HAL-14032); C361 WF1 and WF2, decided by the team on HAL-14396; Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:w0essx14Yi4LrHsrrz+Z6Qvzk1is645zUCQaoTqZpmVw6ITV+1ZoNi8pxUgJwRAV5BvQfAQ5cAjr4mNYKec/DA==

## What changes

- `workflows.canvas.toolbar`: the toolbar's **Step** and **Wait** buttons keep their text on screen, and a screen reader now hears them as "Add step" and "Add wait". The requirement says so, and its first example lists the names heard.
- `workflows.canvas.toolbar`: once a step added with **Step** or **Wait** shows, its docked card opens with its title focused, and the canvas pans the new step into view beside the card, as for any picked step. Before, nothing was read and a new step could land off the canvas's right edge (C361 WF1). The requirement says so, with a new example.
- `workflows.canvas.toolbar`: the divider between **Wait** and **Auto layout** takes the text's colour in forced colours, so it no longer disappears in high contrast (C361 WF2).

Nothing is removed or weakened: what the buttons do, where they are and what they show stay the same.

## Why

Sofia's UX and accessibility check C285 (TB1) found that "Step" and "Wait" alone don't say what pressing them does. The names heard now say it, while the short text keeps the toolbar small.

Her check C361 (WF1) found that a step added from the toolbar was neither read out nor brought into view (WCAG 4.1.3). UX 10.8 says the new step's card opens with focus; with the docked card that now happens. The card has no Name field yet, so its title takes focus, as for any pick.

## Covers

- workflows.canvas.toolbar
