# Decision: a pick in the Places drawer, a file from its tree included, puts focus on the new page

- Task: HAL-14396
- Approval: C361 PD1 and PD2, decided by the team on HAL-14396; Liam approves this note in review
- Kind: user-visible

## What changes

- `shell.places-drawer`: opening a file from the drawer's Files tree is a pick too, as is anything in the drawer that opens another page. The drawer closes and focus goes to the new page's `h1`, as at full width. Moving in the tree, opening a folder and a row's menu keep the drawer open. The requirement says so, with a new example.
- `shell.places-drawer`: the drawer closes with the page no longer inert, and focus goes to the new page's `h1` also when the page draws it a moment later, as a place's view does the first time it shows. Before, the focus went to the Places button (C361 PD1).

Nothing is removed or weakened: Esc, the scrim and the Places button still close the drawer and give the focus back to the button.

## Why

Sofia's UX and accessibility check C361 found that in a narrow window (200 % zoom on a 1280 px screen) a pick in the drawer left the focus on Places, so a screen reader heard "Places, button", not the new page (PD1, WCAG 2.4.3). The requirement already said focus goes to the new page's `h1`. Opening a file from the tree left the drawer over the editor (PD2), because only a click on a link closed it.

## Covers

- shell.places-drawer
