# workflows.page.tool-step

- Status: active
- Since: unreleased
- Source: HAL-18635 (the `tool` step kind of the workflow format, `workflow.tool-step`); Studio doesn't offer tool steps yet, as for rule steps (`workflows.page.rule-step`)

When a workflow has a `tool` step, the workflows feature shall show its card on the canvas with the kind "TOOL STEP", and the step's docked card shall show "Tool" as its kind in the Type picker, after the six kinds the picker lists for every step (`workflows.page.step-card`), together with **Save output as** and **Description**. The Type picker of any other step shall list neither Rule nor Tool.

## Examples

- Given the tool step `merge` with the output `merged`,
  when it is picked on the canvas,
  then its card on the canvas says "TOOL STEP", its Type picker lists Agent step, Wait, End, Workflow, Parallel, For each and Tool with Tool picked, and **Save output as** holds `merged`.
- Given the rule step `match` in the same workflow,
  when it is picked,
  then its Type picker lists the six kinds and Rule, not Tool.
