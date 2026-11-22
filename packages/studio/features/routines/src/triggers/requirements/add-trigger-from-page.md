# routines.triggers.add-trigger-from-page

- Status: draft
- Since: unreleased
- Source: HAL-15441 (C561 finding 4.2 of HAL-15313); HAL-15731 (C622 finding 2 of HAL-15727); `routines.triggers.agent-cant-run-note`; `shell.item-page-sections`; `agents.map.add-button-per-side`

When the page draws the Triggers section on its add step (`SECTION_ADD_STEP`), the section shall, on a workflow, do once what its own **Add trigger** does (`routines.triggers.add-trigger-creates-routine`), so nobody has to press **Add trigger** a second time. On an agent it shall show no **Prompt** yet and focus its **Add trigger**, which the line that Halonic can't run an agent on its own yet describes, so the person reads that line before writing the agent's task. Without the step, or with a step it doesn't know, the section shall show as it is.

## Examples

- Given the agent Writer, when its map's **+ Add trigger** opens Configuration › Triggers, then the section shows "Halonic can't run an agent on its own yet, …" with **Add trigger** focused and no **Prompt**, and makes nothing; a screen reader reads the line with **Add trigger**.
- Given the agent Writer opened that way, when the person presses **Add trigger**, then the section shows an empty, focused **Prompt** with "Say what Writer should do." under it.
- Given a workflow, when its Triggers section is drawn on its add step, then it makes one routine and opens its page.
- Given the agent Writer, when the person picks Triggers in Configuration by hand, then the section shows its rows and **Add trigger**, with no **Prompt**.
