# engine.foreach-state

- Status: active
- Since: 0.1.0
- Source: HAL-1537, step 5(c) of the HAL-186 plan; "For-each" in docs/specs/workflow-semantics.md

When a run enters a `foreach` state with an agent, the engine shall render `items` against the scope and ask for one model call per item, in list order, with at most `concurrency` calls (default 1) waiting at once. Each item's prompt shall be the state's `input` rendered with the item under `as` (default `item`) and its 0-based place under `index`, or, with no `input`, the item itself as text or JSON. Each item's `agent.started` and `agent.finished` shall carry `item`. When every item has finished, the engine shall write the results to `output` as a list in item order and take the `done` transition; an empty list gives `[]` at once. When an item's call fails, or its agent stops for an approval, the engine shall fail the run, with the call's reason. When the state names no items, items that aren't a list, or neither an agent nor a workflow, the engine shall fail the run with an error that says so.

## Examples

- Given a `triage` state with `items: "{{input.emails}}"`, `as: email`, `concurrency: 2` and three emails,
  when the run enters it,
  then the engine records `agent.started` for items 0 and 1 and asks for `call-1` and `call-2`.
- Given that state,
  when item 1 answers before item 0,
  then item 2 starts, and once all three have answered, `labels` is the three answers in email order.
- Given that state with `items: "{{input.subject}}"`, a text,
  when the run enters it,
  then the run fails with an error that says the items give a text, not a list.
- Given an item call that fails because the model can't be reached,
  then the run fails with the reason `model-unreachable`.
