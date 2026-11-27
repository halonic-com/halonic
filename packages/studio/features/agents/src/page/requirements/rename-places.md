# agents.page.rename-places

- Status: active
- Since: unreleased
- Source: HAL-18933 (T6 gap 9 on HAL-17270); flow-agents 3.1 "Renaming" (save model 5, revision 26); `files.ui.rename-file` for the names rule

While the person types a new name for the agent in its page header (`agents.page.rename`) and other things use the agent, the agents feature shall say under the name field (`shell.item-page-name-note`) "Also updates *n* places: *names*", where each workflow step that runs the agent is one place named "*workflow* (*step*)", the step as its card on the workflow's canvas names it, and each routine that starts the agent is one place named "*routine* (routine)", the steps first. Up to 5 names shall show in full; more than 5 shall show as 4 names and "and *n* more". When nothing uses the agent, or the workflows and routines can't be read, no line shall show and the rename shall work as before.

## Examples

- Given workflow "Inbox flow" runs the agent in step "Sort mail", workflow "Weekly report" in step "Draft", and routine "Morning digest" starts it,
  when the person types "Mail sorter" in the name field,
  then the line under the field reads "Also updates 3 places: Inbox flow (Sort mail), Weekly report (Draft), Morning digest (routine)".
- Given nothing uses the agent,
  when the person types a new name,
  then no line shows under the field.
