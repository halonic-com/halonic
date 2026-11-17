# workflows.page.frame-and-states

- Status: draft
- Since: 0.1.0
- Source: HAL-9865 (T7 PR 3); flow-workflows 3.1, 4.7; states C8, C9, C16, D9, D10; UX checklist 3.4

When a workflow's tab opens, the workflows feature shall show a full-width page with the workflow's letter avatar, "WORKFLOW" and its name, and under it the canvas of its steps, with no ⤢, no ✕ and no chat column; when the host takes over 300 ms to give the workflow it shall show a skeleton, never before; when the host can't read it, it shall say "Couldn't load this workflow", the reason and **Try again**; when it is opened on its Tests (`openItem`'s `step` is `tests`) it shall open Configuration on Tests instead of the canvas.

## Examples

- Given the host answers at once, then the page shows the name and the step cards, and no skeleton.
- Given the host takes over 300 ms, then a status says "Loading reply" with grey bars; after 10 s it adds "Still loading" and **Try again**.
- Given the host says "The engine isn't answering. It may still be starting.", then the page shows "Couldn't load this workflow", that sentence and **Try again**, which reads again.
- Given the page is open, then it has no button for ⤢ or ✕.
- Given the host says the workflow changed, then the canvas shows the new step and the person's zoom stays.
- Given the workflow is opened on its Tests,
  then Configuration shows with Tests picked, and coming back to it from another tab opens General.
- Given the workflow's page is open on Flow and is then asked for its Tests,
  then Configuration shows with Tests picked.
