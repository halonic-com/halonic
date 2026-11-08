# shell.feature-isolation

- Status: active
- Since: 0.1.0
- Source: HAL-171; plan 5.3 (the shell's acceptance test), 5.4

A feature shall be able to add a section to another feature's item page through `itemPage.addSection`, using the other feature only through its `api.ts`. The page's owner shall not import anything of the feature that adds the section.

## Examples

- Given a stub _agents_ feature that adds the item kind `agent`, and a stub _routines_ feature that adds a Triggers section `on: "agent"` and needs the agents service,
  when the shell is created and the agent page's sections are listed,
  then the Triggers section from _routines_ is there, its view loads by name, and it can use the agents service.
- Given the same two stubs,
  when their imports are read,
  then _routines_ imports only `agents/api.ts` from _agents_, and _agents_ imports nothing from _routines_.
