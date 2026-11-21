# agents.map.add-button-per-side

- Status: draft
- Since: unreleased
- Source: HAL-13180; HAL-15012 (C525-4); flow-agents 6; UX checklist 9.9; microcopy 8.4

The agents feature shall end each side of the agent map in its add button, also when the side is empty, where **Add a tool** opens Configuration › Tools, **Add subagent** opens Configuration › Subagents with its Add subagent dialog open, and **Add trigger** opens Configuration › Triggers and is there only once a feature adds Triggers to the agent's page; **Add a tool** and **Add trigger** shall put the focus on their page's name in Configuration's list of pages, and an agent with no work in, no tools and no subagents shall show only the centre card and the add buttons, with no other text.

## Examples

- Given the agent "Refund checker" with nothing set and no Triggers section, then the map shows the centre card "Refund checker", **Add a tool** and **Add subagent**, and no **Add trigger**.
- Given the routines feature adds Triggers, then the left side ends in **Add trigger**, and pressing it shows Configuration › Triggers.
- Given the map, when **Add a tool** is pressed, then Configuration shows its Tools page, and the focus is on "Tools" in its list of pages.
- Given Triggers is added, when **Add trigger** is pressed, then the focus is on "Triggers" in Configuration's list of pages.
- Given the map, when **Add subagent** is pressed, then Configuration shows Subagents with the dialog "Add a subagent to Refund checker" open.
