# Decision: a workflow routine's input "takes named fields"

- Approval: the task HAL-15751 asks for this change, from Liam's review of HAL-15734 (#4844). The team decides it under the HAL-2282 rule, since it rewords a message that is already there, for the same case. Liam signs this note in review.
- Kind: user-visible

## What changes

- `format.routine-file`: the message for a workflow routine whose `input` is a text or a list, such as `input: "{{trigger.body}}"`, changes from "A workflow routine's input is a list of fields, such as input: { mail: "{{trigger.body}}" }." to "A workflow routine's input takes named fields, such as input: { mail: "{{trigger.body}}" }.". The case, the code (`invalid_union`) and the path (`run`) stay the same. The requirement's text and its example change to the new words; nothing else in it changes.

## Why

Liam's review note on #4844: "a list of fields" reads oddly when someone wrote `input: [mail]`, which is a list and is still refused. "Named fields" says what the map needs.

## Tests

No test was weakened or skipped. `routine.test.ts` checks the new words in place of the old ones.

## Covers

- format.routine-file
