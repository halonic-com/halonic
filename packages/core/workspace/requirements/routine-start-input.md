# workspace.routine-start-input

- Status: active
- Since: unreleased
- Source: HAL-14777 (C480 P5, Kim's re-run on HAL-14760, question 16; decided by Liam on HAL-14776)

When `loadWorkspace` has parsed a workspace's files, the workspace package shall report as an error with the code `missing-routine-input`, at `run.input`, a workflow routine whose input lacks a field the workflow's first step reads by name (`gets: [input.<name>]` or `{{input.<name>}}`), with the message `<routine name> starts <workflow> without <fields>, which its first step reads. Add <fields> under run.input.` A key counts as given whatever its value, a `{{trigger.…}}` template included. A first step that sends its agent the whole input (no prompt, method or `gets`, or `{{input}}`) is not checked. `halonic routines` then lists the routine as `✕ Can't start`.

## Examples

- Given a routine Monday note that runs `announce`, whose first step's prompt is `Write an announcement about: {{input.topic}}`, and no `run.input`, when the workspace is loaded, then the error says "Monday note starts announce without topic, which its first step reads. Add topic under run.input.", `halonic validate` exits 1 and `halonic routines` shows `✕ Can't start`.
- Given the same routine with `input: { topic: "{{trigger.at}}" }`, when the workspace is loaded, then nothing is reported.
- Given a routine whose workflow's first step reads `input.day` and `input.team`, and `input: { dya: monday }`, when the workspace is loaded, then the error names `day and team`, next to the `unread-routine-input` warning at `run.input.dya`.
