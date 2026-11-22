# Decision: the remove and "couldn't change" toasts name steps by title, as the card does

- Approval: /HAL/issues/HAL-15829 (flow check C638 of /HAL/issues/HAL-15825, row 3), wording on approved toasts, decided by the team (HAL-2282)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:BwrpGaYwmgN91ACzj8lAn0ZBvrbaCa2P6py/x5k0ImxVzYkkxgA+ngEU1ffHGzRdynVacGZedSlJlLzODixUBw==

Removing a step said "Removed step classify and 2 arrows", and removing an arrow "Removed the arrow from sort to approve": the toasts named steps by their ids. On the same docked card, the arrow rows, **Go to…** and the announcements name a step as its card on the canvas does, by its title, else its id, with the id in brackets after a title another step shares (`workflows.page.step-arrows`), and #4833 made the outline do the same. The requirements quoted `<id>`, so the tests passed.

The remove toasts, the failed Undo lines and the "Couldn't change step …" toast of the card, its arrows and a drag between ports now name steps the same way, through the `stepNames` the arrows section already uses. A step is named from the workflow as it was before the change, so a removed step keeps its name in its toasts. A step without a title still reads by its id, so the existing examples, whose steps have no titles, stay true.

- workflows.page.remove: the toasts quote `<step>` instead of `<id>`, say how a step is named, and a new example has titled steps, two sharing a title.
- workflows.page.step-arrows, workflows.page.step-card: "Couldn't change step <step>", named the same way.
- workflows.canvas.drag-to-connect: the same, and its example of a refused drop now has `start` titled "Begin" and quotes "Couldn't change step Begin".

New tests cover titled and shared-title steps; the drag test that quoted the id now gives the step a title and quotes it. No test is removed or weakened.

## Covers

- workflows.page.remove
- workflows.page.step-arrows
- workflows.page.step-card
- workflows.canvas.drag-to-connect
