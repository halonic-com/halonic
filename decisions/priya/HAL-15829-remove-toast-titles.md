# Decision: the "couldn't change" toasts name steps by title, as the card does

- Approval: /HAL/issues/HAL-15829 (flow check C638 of /HAL/issues/HAL-15825, row 3), wording on approved toasts, decided by the team (HAL-2282)
- Kind: user-visible

Flow check C638 found that the remove toasts named steps by their ids, while the arrow rows, **Go to…** and the announcements of the same docked card name a step as its card on the canvas does: by its title, else its id, with the id in brackets after a title another step shares (`workflows.page.step-arrows`). HAL-15840 (#4912) since made the remove toasts and the failed Undo lines use those names.

What was still left: the danger toast "Couldn't change step …" of the card, its arrows, a removal the host refuses and a drag between ports still quoted the step's id. It now names the step the same way, through the same `stepNames`, from the workflow as it was before the change. A step without a title still reads by its id, so the existing examples, whose steps have no titles, stay true.

- workflows.page.remove: "Couldn't change step <name>", named the same way, and a new example has titled steps, two sharing a title.
- workflows.page.step-arrows, workflows.page.step-card: "Couldn't change step <step>", named the same way.
- workflows.canvas.drag-to-connect: the same, and its example of a refused drop now has `start` titled "Begin" and quotes "Couldn't change step Begin".

New tests cover titled and shared-title steps; the drag test that quoted the id now gives the step a title and quotes it. No test is removed or weakened.

## Covers

- workflows.page.remove
- workflows.page.step-arrows
- workflows.page.step-card
- workflows.canvas.drag-to-connect
