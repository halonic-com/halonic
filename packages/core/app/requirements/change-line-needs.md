# app.change-line-needs

- Status: active
- Since: 0.1.0
- Source: HAL-3278; HAL-3267 engine answer 5; Changes design 3 ("Undo this change can't go alone")

Where undoing one line of a workflow change alone would leave the workflow pointing at a step that isn't there, the describer shall list that line in the `needs` of each line that points there, so it can't be undone before them, and shall join lines that need each other into one line.

## Examples

- Given step `page-oncall` is added and step `notify` is changed to read `page-oncall`'s output, when the change is described, then the line for `notify` needs the line "Step added: Page oncall".
- Given step `page-oncall` is added and step `classify` is changed to go to it, then the line for `classify` needs it.
- Given step `escalate` is removed and step `classify` is changed so it no longer goes to `escalate`, then "Step removed: Escalate" needs the line for `classify`.
- Given the workflow now starts at an added step, then "Starts at" needs that step's line.
- Given two added steps go to each other, then they are one line, not two lines that need each other.
