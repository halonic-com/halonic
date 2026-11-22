# routines.triggers.add-trigger-from-page

- Status: draft
- Since: unreleased
- Source: HAL-15441 (C561 finding 4.2 of HAL-15313); HAL-15452, which also meets HAL-15731 (C622 finding 2): an agent shows no **Prompt** to write before its line; `shell.item-page-sections`; `agents.map.add-button-per-side`

When the page draws a workflow's Triggers section on its add step (`SECTION_ADD_STEP`), the section shall do once what its own **Add trigger** does (`routines.triggers.add-trigger-creates-routine`), so nobody has to press **Add trigger** a second time. While Halonic can't run an agent on its own, an agent's section on its add step shall show as it is, with the way in to its workflows of `routines.triggers.agent-cant-run-note`, and make nothing. Without the step, or with a step it doesn't know, the section shall show as it is.

## Examples

- Given the agent Writer, when its map's **+ Add trigger** opens Configuration › Triggers, then the section says "Halonic can't run an agent on its own yet, …", shows no **Prompt**, and makes nothing.
- Given a workflow, when its Triggers section is drawn on its add step, then it makes one routine and opens its page.
- Given a workflow, when the person picks Triggers by hand, then the section shows its rows and **Add trigger**, and makes nothing.
