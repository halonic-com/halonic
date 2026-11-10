# engine.budget-composite-stops

- Status: active
- Since: 0.1.0
- Source: HAL-186 implementation plan, step 6 ("a stop in a child run or foreach item ends the parent with `reason: \"budget\"`"); task HAL-1538; builds on `engine.budget-stops`

When a `parallel` state starts its branches, or a `foreach` state starts its next items, while a budget is reached, the kernel shall stop the run as `engine.budget-stops` says, before any of their calls is made. A call of a branch or item that the stopped run had asked for but not yet made shall not be made. When the child run of a `foreach` item fails with the reason `budget`, the run shall fail with the reason `budget` too, its error wrapped as any failure of an item's child run is, `Workflow "<workflow>" failed in item <index> of for-each state "<state>": <error>`. The other items' child runs spend from the same run budget, so each of them stops at its next model call or harness run.

## Examples

- Given a monthly budget of 0.50 EUR, 0.60 EUR spent this month, and a workflow that starts in a `parallel` state with two branches,
  when a run starts,
  then it fails in that state with the reason `budget`, and no branch's model call is made.
- Given a run budget of 0.50 EUR, a `foreach` state that labels three emails two at a time, and a first item whose call cost 0.60 EUR,
  when the first item's answer arrives,
  then the run fails with the reason `budget` before the third item starts, and the second item's call, not yet made, is never made.
- Given a run budget of 0.50 EUR, a `foreach` state that runs `draft-twice` for each of three emails two at a time, and a first child run whose first call cost 0.60 EUR,
  when the child runs reach their second task state,
  then both child runs fail with the reason `budget`, the third item never starts, and the parent fails with the reason `budget`.
- Given a monthly budget of 0.50 EUR, 0.60 EUR spent this month, and the same `foreach` state,
  when a run starts,
  then its error is `Workflow "draft-twice" failed in item 0 of for-each state "work": Monthly budget reached: 0.60 of 0.50 EUR spent this month.`
