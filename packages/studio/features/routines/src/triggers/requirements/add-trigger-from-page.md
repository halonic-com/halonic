# routines.triggers.add-trigger-from-page

- Status: draft
- Since: unreleased
- Source: HAL-15441 (C561 finding 4.2 of HAL-15313); `shell.item-page-sections`; `agents.map.add-button-per-side`

When the page draws the Triggers section on its add step (`SECTION_ADD_STEP`), the section shall do once what its own **Add trigger** does (`routines.triggers.add-trigger-creates-routine`), so on an agent its **Prompt** shows at once, focused, and nobody has to press **Add trigger** a second time. Without the step, or with a step it doesn't know, the section shall show as it is.

## Examples

- Given the agent Writer, when its map's **+ Add trigger** opens Configuration › Triggers, then the section shows an empty, focused **Prompt** with "Say what Writer should do." under it, and makes nothing yet.
- Given a workflow, when its Triggers section is drawn on its add step, then it makes one routine and opens its page.
- Given the agent Writer, when the person picks Triggers in Configuration by hand, then the section shows its rows and **Add trigger**, with no **Prompt**.
