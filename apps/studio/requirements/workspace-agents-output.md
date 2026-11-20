# studio.workspace-agents-output

- Status: draft
- Since: unreleased
- Source: HAL-13178 (T6, Behaviour's Output field); flow-agents 5.2; the agent file's `output`

The desktop app's agents host shall give an agent's settings its `output` as the file says, text when the file says none, and shall change an agent's `output` by editing its file in place as one undoable change: text, one of a list of options, or JSON with a schema or without one. It shall refuse a list of options that has none, and write nothing.

## Examples

- Given an agent whose file has no `output`, then its settings give the output text.
- Given the output "one of a list" with reply and archive, then the file holds both options in place, its other lines stay, and the settings give them.
- Given the output JSON with a schema, then the settings give that schema; given JSON with no schema, then the file has no `schema` key.
- Given the output "one of a list" with no options, then the change fails with `invalid_input` and nothing is written.
