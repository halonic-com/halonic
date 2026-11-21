# studio.first-hub-unloadable

- Status: draft
- Since: unreleased
- Source: HAL-14884, from the review of HAL-14840 (#4283) and UX check C503 (M1, HAL-14914); builds on `studio.first-hub`

When the desktop app creates an agent or a workflow in the Default hub (`hubs/default`) of a folder whose `hubs/default/hub.yaml` exists but doesn't load, it shall refuse with `invalid_input`, the message "hubs/default/hub.yaml can't be read right now (line *n*)." and the fix "Fix it in the file, then try again.", carrying the file and the line of the file's first load error as facts, and it shall write nothing, so the user's file is kept as it is. The parser's own sentence shall be only the refusal's cause, for the log, never its message. A warning in that file, or an error in another file, shall not stop the Default hub from being written.

## Examples

- Given a folder whose `hubs/default/hub.yaml` is `id: default` and `name: [Default`, when the agent "Greeter" is created in `default`, then it is refused with "hubs/default/hub.yaml can't be read right now (line 2)." and "Fix it in the file, then try again.", and the file still holds the same text.
- Given the same folder, when the workflow "Daily summary" is created in `default`, then it is refused the same way and nothing is written.
- Given a folder whose Default hub file has only a warning, or whose other files have errors, when an agent is created in `default`, then the Default hub's `hub.yaml` is written with it, as in `studio.first-hub`.
