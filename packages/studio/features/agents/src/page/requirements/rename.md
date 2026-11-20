# agents.page.rename

- Status: draft
- Since: unreleased
- Source: HAL-1299 (T6 PR 4d); flow-agents 3.1; save model 5; HAL-14377 (AG1, AG2)

The agents feature shall show the agent's name in its page header as a field that renames the agent: the name is checked as it is typed, and an empty name or the name of another agent in the hub is not applied and says why; Enter or leaving the field applies the name as one change that keeps the id, and Esc puts the old name back. Enter shall keep focus in the field. The agent's window tab shall take the new name too.

## Examples

- Given the person types "Mail sorter" and presses Enter, then the agent's name becomes "Mail sorter", its id stays and focus stays in the field.
- Given the agent's tab is open and the agent is renamed to "Mail sorter", then the tab says "Mail sorter".
- Given the person types the name of another agent in the hub, then the field says "An agent called Writer already exists." and leaving it puts the old name back.
- Given the person empties the field, then it says "Give it a name." and nothing is saved.
- Given the person types a new name and presses Esc, then the old name is back and nothing is saved.
