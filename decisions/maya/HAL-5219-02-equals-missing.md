# Decision: a missing value equals nothing in guards

- Approval: [HAL-5219](/HAL/issues/HAL-5219)
- Kind: internal

The guard requirement gains one sentence and one example: a missing value is not the same as another missing value, so `equals` fails and `notEquals` passes. No test is removed.

## Covers

- workflow.guard
