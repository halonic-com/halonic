# Decision: show the thousands reading of `toNumber` in its requirement

- Approval: [HAL-5219](/HAL/issues/HAL-5219)
- Kind: internal

`toNumber` reads three or more digits after a lone separator as thousands, so `0.125` gives 125. That is what the requirement says, but no example showed it and the doc comment didn't warn. This adds the two surprising examples to the requirement, a line to the doc comment and a test. The behaviour doesn't change. Whether it should (read a lone separator before three or more digits as a decimal) is a separate decision on the task.

## Covers

- workflow.to-number
