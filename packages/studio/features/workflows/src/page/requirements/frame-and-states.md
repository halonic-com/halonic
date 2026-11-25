# workflows.page.frame-and-states

- Status: draft
- Since: unreleased
- Source: HAL-9865 (T7 PR 3), HAL-11642; HAL-18054 (T14 PR 17c, the chat); flow-workflows 3.1, 4.7; states C8, C9, C16, D9, D10; UX checklist 3.4; microcopy 2 "Item gone"

When a workflow's tab opens, the workflows feature shall show the workflow's page in the shell's item page, with "WORKFLOW" and its name in the header and the canvas of its steps under it; when the Assistant gives a chat about the workflow (flow-assistant 2.4), the chat shall be on the left and the canvas in the panel beside it (`shell.item-page-chat`), and without one the page shall take the full width, with no ⤢, no ✕ and no chat column; on a phone the page shall keep its letter avatar, "WORKFLOW" and its views under the top bar; when the host takes over 300 ms to give the workflow it shall show a skeleton, never before; when the host can't read it, it shall say "Couldn't load this workflow", the reason and **Try again**; when the workflow isn't in the workspace (a `not_found` answer) it shall show the item-gone state, "This workflow isn't in this workspace any more." and **Go to Workflows**, instead; when it is opened on its Tests (`openItem`'s `step` is `tests`) it shall open Configuration on Tests instead of the canvas.

## Examples

- Given the host answers at once, then the page shows the name and the step cards, and no skeleton.
- Given the host takes over 300 ms, then a status says "Loading reply" with grey bars; after 10 s it adds "Still loading" and **Try again**.
- Given the host says "The engine isn't answering. It may still be starting.", then the page shows "Couldn't load this workflow", that sentence and **Try again**, which reads again.
- Given the host says the workflow isn't there, then the page says "This workflow isn't in this workspace any more." with **Go to Workflows** and no **Try again**.
- Given the page is open and the Assistant gives no chat, then it has no button for ⤢ or ✕.
- Given the Assistant gives a chat about "Support reply", then the chat is on the left and the canvas in the panel beside it.
- Given the host says the workflow changed, then the canvas shows the new step and the person's zoom stays.
- Given the workflow is opened on its Tests,
  then Configuration shows with Tests picked, and coming back to it from another tab opens General.
- Given the workflow's page is open on Flow and is then asked for its Tests,
  then Configuration shows with Tests picked.
