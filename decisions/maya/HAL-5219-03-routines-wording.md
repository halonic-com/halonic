# Decision: interval triggers say UTC

- Approval: [HAL-5219](/HAL/issues/HAL-5219)
- Kind: internal

The describe-trigger requirement says an interval of whole hours or days reads with "(UTC)" after it. The existing expectations are updated to the new text; no test is removed.

## Covers

- routines.describe-trigger
