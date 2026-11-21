# Decision: a pick in the Places drawer, a file from its tree included, puts focus on the new page

- Task: HAL-14396
- Approval: C361 PD1 and PD2 and C383 SP1, decided by the team on HAL-14396; Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:FFl5ZtrufLlRgHwg5ZTEfk9lorQUnD64u3s3uJgBd6iUA1xQ7XibYpRgv5/er+oFum3xobuRln+x0qLzG0RGCQ==

## What changes

- `shell.places-drawer`: opening a file from the drawer's Files tree is a pick too, as is anything in the drawer that opens another page. The drawer closes and focus goes to the new page's `h1`, as at full width. Moving in the tree, opening a folder and a row's menu keep the drawer open. The requirement says so, with a new example.
- `shell.places-drawer`: the drawer closes with the page no longer inert, and focus goes to the new page's `h1` also when the page draws it a moment later, as a place's view does the first time it shows. Before, the focus went to the Places button (C361 PD1).

- `shell.sidebar-settings`: a page a Settings section opens, such as a plugin's page from Plugins, takes the focus on its `h1` at every width, also when it draws it a moment later. Before, in a narrow window, Settings gave the focus to Places, as its opener (the closed drawer's Settings row) was hidden, and the page's `h1` never got it (C383 SP1). The requirement now also says that Settings gives the focus to Places when it closes otherwise in a narrow window, which it already did.

Nothing is removed or weakened: Esc, the scrim and the Places button still close the drawer and give the focus back to the button, and Escape from Settings opened from the drawer still lands on Places.

## Why

Sofia's UX and accessibility check C361 found that in a narrow window (200 % zoom on a 1280 px screen) a pick in the drawer left the focus on Places, so a screen reader heard "Places, button", not the new page (PD1, WCAG 2.4.3). The requirement already said focus goes to the new page's `h1`. Opening a file from the tree left the drawer over the editor (PD2), because only a click on a link closed it. Her check C383 found the same at 200 % for a plugin opened from Settings › Plugins (SP1).

## Covers

- shell.places-drawer
- shell.sidebar-settings
