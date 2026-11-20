# workflow.validate-input

- Status: active
- Since: unreleased
- Source: HAL-14267 (C337 C9 (a) and (b), Nina's check on HAL-14257, rows 1 and 3; decided by Liam on the task)

The workflow's input fields are its `start.field`, when a step reads it, and the input fields the caller gives (the workspace gives the keys of the workflow's tests' inputs and of the inputs of the routines that run it). If a workflow has input fields, and a step reads `input.<name>`, in `gets` or as `{{input.<name>}}` in one of its texts, and `<name>` isn't one of them, then the workflow rules shall report the error `unknown-gets` at that place (`unknown-template-name` for a `{{input.<name>}}`, as for `{{context.<key>}}`), with the message `"<step>" gets input.<name>, but the workflow's input has no field <name>.` (`uses {{input.<name>}}` for a text) and, when exactly one field is at most two letters away, `Did you mean input.<field>?`, or else the fields there are. If no step reads `input.<start.field>`, then they shall report the error `unread-start-field` at `start.field`, naming the fields the steps do read. A workflow with a step that sends its agent the whole input (no prompt, method or `gets`, or `{{input}}`) is not checked.

## Examples

- Given Support reply, whose `start.field` is `mail`, with the step `read` changed to `gets: [input.email]`,
  when the workflow is checked,
  then the message is `"read" gets input.email, but the workflow's input has no field email. Did you mean input.mail?`
- Given Support reply with `start: { field: email }` while the steps read `input.mail`,
  when the workflow is checked,
  then the only input error is `start.field is email, but no step reads input.email. The steps read input.mail: use one of those names as field, or add input.email to a step's gets.`
- Given a workflow with no `start` and no tests,
  when a step reads `input.anything`,
  then nothing is reported.
