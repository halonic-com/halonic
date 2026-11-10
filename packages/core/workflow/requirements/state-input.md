# workflow.state-input

- Status: active
- Since: 0.1.0
- Source: `promptFor` and `childInput` in the old workflow package (`packages/core/workflow/src/inputs.ts`) at 784f78d; the rule for a step that picks data and has no input from the old engine (`engine.ts` at 784f78d, HAL-4455)

When an agent state builds its prompt, the workflow rules shall render its `input` text, or render each value of an `input` map and write the map as JSON, or, with no `input`, write the run's input as JSON. When a step with no `input` picks data (`gets`), the rules shall send only the picked data, without the run's input. When a `workflow` state builds its child run's input, the rules shall render each value of an `input` map on its own, so a value that is one placeholder keeps its type; turn an `input` text into `{ message: <rendered text> }`; and give an empty input when there is none.

## Examples

- Given the input `Reply to {{input.from}}` and `from: support`, when the prompt is built, then it is `Reply to support`.
- Given no `input` and the run input `{ n: 3 }`, when the prompt is built, then it is `{"n":3}`.
- Given no `input`, the picks `input.from` and the run input `{ from: support, secret: not sent }`, when the prompt is built, then it is the `## Data` section with `support` alone.
- Given the child input `{ count: "{{input.n}}" }` and `n: 3`, when the child's input is built, then `count` is the number `3`.
- Given the child input `Count {{input.n}}`, when the child's input is built, then it is `{ message: "Count 3" }`.
