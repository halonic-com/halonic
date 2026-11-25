# Decision: the rule step's "can't run" error in plain words

- Approval: wording decided by the words check HAL-18822 and set on HAL-18838; the reviewer (Liam) approves this note in review
- Kind: user-visible

## What changes

`engine.rule-state` names the error a local executor with no isolate gives at a rule step. It was
`This engine can't run rule steps`; it is now `Step "<name>" is a rule step, and rule steps can't run
here yet. Remove the step to run this workflow.` The example says the same for the step `match`. The
test now compares the whole message instead of a prefix, so it checks more, not less. Nothing else in
the requirement changes.

## Why

The old text showed "engine" and "ToolScript isolate" to users and didn't say what to do. The words
check HAL-18822 chose the new text.

## Covers

- engine.rule-state
