# agents.page.rename

- Status: draft
- Since: unreleased
- Source: HAL-1299 (T6 PR 4d); HAL-13177 (the header's name field is the shell's); flow-agents 3.1; save model 5

The agents feature shall show the agent's name in its page header as a field that renames the agent: the name is checked as it is typed (`shell.item-page-header`): the name of another agent in the hub is not applied and says why, and an empty name is not applied and the old one comes back; Enter or leaving the field applies the name as one change that keeps the id, and Esc puts the old name back.

## Examples

- Given the person types "Mail sorter" and presses Enter, then the agent's name becomes "Mail sorter" and its id stays.
- Given the person types the name of another agent in the hub, then the field says "An agent called Writer already exists." and leaving it puts the old name back.
- Given the person empties the field and presses Enter, then "Sorter" is back and nothing is saved.
- Given the person types a new name and presses Esc, then the old name is back and nothing is saved.
