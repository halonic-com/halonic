# app.change-line-parts

- Status: active
- Since: 0.1.0
- Source: HAL-3278; HAL-3267 engine answer 5; Changes design 3 and 8 (routines' fields added by the team)

When a describer describes a change to a workflow, an agent or a routine, each line it gives shall name the parts of the item it covers as paths of map keys (a step's id, a field's name), never list positions, so that reverting those parts takes out that change and nothing else.

## Examples

- Given workflow "Support triage" gets a new step `page-oncall` between `classify` and `notify`, when the change is described, then the line "Step added: Page oncall" covers `states › page-oncall`.
- Given the step `classify` was removed as well, then the path for `page-oncall` is the same: removing a step never moves another step's path.
- Given a step was added and placed on the canvas, then its line covers `layout › page-oncall` too, so undoing it leaves no position behind.
- Given the workflow's name changed, then the line "Name: Support → Support triage" covers `name`.
- Given any line's parts are reverted in the after version with the before version as reference, then the result describes as the other lines only.
- Given agent "Finance" changed its model and its method `extract-invoice`, then the line "Model: claude → gpt" covers `model` and the line "Method changed: Extract invoice (instructions)" covers `methods › extract-invoice`.
- Given routine "Morning report" moved from 08:00 to 07:00 on weekdays, then the line "Schedule: Weekdays at 08:00 → Weekdays at 07:00" covers `trigger`.
- Given a list field changed, such as an agent's connections, then its one line covers the whole list.
- Given the workflow, agent or routine is new or deleted as a whole, then there is one line, "New" or "Deleted", with no parts.
