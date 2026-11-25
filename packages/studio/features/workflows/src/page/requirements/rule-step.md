# workflows.page.rule-step

- Status: active
- Since: unreleased
- Source: HAL-18500 (the `rule` step kind of the workflow format, `workflow.rule-step`); Studio doesn't offer rule steps yet

When a workflow has a `rule` step, the workflows feature shall show its card on the canvas with the kind "RULE STEP", and the step's docked card shall show "Rule" as its kind in the Type picker, after the six kinds the picker lists for every step (`workflows.page.step-card`), together with **Save output as** and **Description**. The Type picker of any other step shall list only the six kinds.

## Examples

- Given the rule step `match` with the output `decisions`,
  when it is picked on the canvas,
  then its card on the canvas says "RULE STEP", its Type picker lists Agent step, Wait, End, Workflow, Parallel, For each and Rule with Rule picked, and **Save output as** holds `decisions`.
- Given the task step `write` in the same workflow,
  when it is picked,
  then its Type picker lists only the six kinds.
