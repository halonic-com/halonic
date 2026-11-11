# engine.foreach-workflow-items

- Status: active
- Since: 0.1.0
- Source: HAL-1537, step 5(c) of the HAL-186 plan; "For-each" in docs/specs/workflow-semantics.md; HAL-6090 (E8: a waiting item's child run is cancelled)

When a run enters a `foreach` state with a workflow, the engine shall ask for one child run of that workflow per item, from the definitions the run started with, in list order, with at most `concurrency` child runs (default 1) going at once and a depth one more than the run's. Each child's input shall be the state's `input` rendered with the item under `as` (default `item`) and its 0-based place under `index`, or, with no `input`, `{ <as>: item }`. Each item's `workflow.started` and `workflow.finished` shall carry `item`, and a completed child's `workflow.finished` shall carry its final context. When every child has completed, the engine shall write their final contexts to `output` as a list in item order and take the `done` transition. When an item's child run fails, the engine shall record its `workflow.finished` and fail the run; when an item's child run waits, the engine shall fail the run, because an item's child run must finish without waiting, and shall end that child and every other item's child run still going with `run.failed` and `reason: "cancelled"`, as a cancel of each would, so that none is left waiting. When the workflow isn't among the run's definitions, or its child runs would be more than 5 deep, the engine shall fail the run with an error that says so.

## Examples

- Given a `greet` state that runs `reply` for `["acme", "globex", "initech"]` as `customer`, two at a time,
  when the run enters it,
  then the engine records `workflow.started` for items 0 and 1 and asks for child runs with `{ customer: "acme" }` and `{ customer: "globex" }`.
- Given those children,
  when item 1's child completes with `{ reply: "Hi Globex" }`,
  then the engine records its `workflow.finished` with that context and starts item 2.
- Given an item's child run,
  when it waits for `approve` or `reject`,
  then the run fails with an error that says an item's child run must finish without waiting.
- Given items 0 and 1's child runs, where item 1's still runs,
  when item 0's child waits,
  then both children end with `run.failed` and `reason: "cancelled"`, and neither is left `waiting`.
