# workspace.routine-input

- Status: active
- Since: unreleased
- Source: HAL-14316 (C340 C30 (a), Nina's check on HAL-14271, row 10); HAL-15711 (C615, fields the routine already gives)

When `loadWorkspace` has parsed a workspace's files, the workspace package shall report as a warning with the code `unread-routine-input`, at `run.input.<key>`, each key of a routine's workflow input that no step of the workflow reads as `input.<key>` (in `gets`, or as `{{input.<key>}}` in one of its texts), with the message `Routine "<id>": workflow "<workflow>" doesn't read input.<key>.` and, when exactly one read field is at most two letters away, `Did you mean input.<field>?`, or else the fields the steps read. Both leave out the fields the routine's input already gives; when that leaves none, the message ends with `The routine already gives every field its steps read: remove the key.` A workflow with a step that sends its agent the whole input (no prompt, method or `gets`, or `{{input}}`) reads every key, so it is not checked.

## Examples

- Given a routine with `input: { dya: monday }` whose workflow's step has `gets: [input.day]`, when the workspace is loaded, then the warning `unread-routine-input` is at `run.input.dya` with `Did you mean input.day?`, and `halonic validate` passes.
- Given a routine with `input: { region: north }` whose workflow reads `input.day` and `input.team`, when the workspace is loaded, then the warning names `input.day and input.team`.
- Given a routine with `input: { mail: hi, region: north }` whose workflow reads only `input.mail`, when the workspace is loaded, then the warning at `run.input.region` says `The routine already gives every field its steps read: remove the key.`, and with `input: { day: monday, dya: tuesday }` for a workflow that reads `input.day` and `input.team`, the warning at `run.input.dya` names only `input.team`.
- Given a routine whose workflow reads `{{input.day}}` in a prompt, when its input has `day`, then nothing is reported.
- Given a routine whose workflow's agent step has no prompt, method or `gets`, when its input has any key, then nothing is reported.
