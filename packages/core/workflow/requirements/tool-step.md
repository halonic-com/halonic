# workflow.tool-step

- Status: active
- Since: unreleased
- Source: HAL-18635 (S12 of HAL-18490, on the PR watcher's critical path, HAL-17974), with the plan rev 1 approved there

The workflow format shall have a `tool` step kind that calls one tool of a connector directly, with no model (`engine.tool-state`). A tool step shall use the keys `connector`, `tool`, `with`, `output` and `signal`: `connector` is the id of a connector the hub can see, `tool` the tool's name as its server lists it, `with` the tool's arguments as templates, and `output` the context key its result goes to. When a workflow is checked, a tool step with no `connector` shall be the error `tool-without-connector`, one with no `tool` the error `tool-without-name`, and one with no `output` the error `tool-without-output`, because the engine fails the run there; `with` on a tool step shall not be the "has with but no method" warning, and any other key on a tool step shall be the warning `ignored-key`. A tool step whose tool may ask for a person's OK should have a transition for `rejected`, the event it finishes with when the person says no.

Rationale: a no-model routine, such as the PR watcher, acts on its rule's decisions through the same connector calls, checks and approvals an agent's call goes through.

## Examples

- Given the tool step `merge` with `connector: github`, `tool: merge_pull_request`, `with: { pr: "{{context.decisions.merge}}" }` and `output: merged`,
  when the workflow is checked,
  then there is no issue.
- Given a tool step with no `connector`, `tool` or `output`,
  when the workflow is checked,
  then the three errors are reported, each naming the step and the fix.
- Given a tool step with `agent: writer`,
  when the workflow is checked,
  then `agent` is an `ignored-key` warning.
