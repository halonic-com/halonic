# Decision: a workflow routine whose input is a text says its input takes fields

- Approval: the task HAL-15734 asks for this change, from flow check C619 (HAL-15724). The team decides it under the HAL-2282 rule, since it rewords a message that is already there for one case. Liam signs this note in review.
- Kind: user-visible

## What changes

- `format.routine-file`: a routine `run` with a workflow, no agent, and an `input` that is a text or a list, such as `input: "{{trigger.body}}"`, gets "A workflow routine's input is a list of fields, such as input: { mail: "{{trigger.body}}" }." instead of "run needs a workflow, with its input, or an agent, with its prompt.". The code stays `invalid_union`, at `run`. Every other target of no kind keeps its message. One example is added.

## Why

C619: the run had a workflow and an input, so "run needs a workflow, with its input" sent the reader looking for something that wasn't missing. The cause is that `input` is a map of named fields.

## Tests

No test was weakened or skipped. `routine.test.ts` adds a test for a text input and a list input.

## Covers

- format.routine-file
