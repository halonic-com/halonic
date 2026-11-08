# Decision: cron and interval messages become full sentences

- Requirements: `routines.cron-rejects-bad-expressions`, `routines.parse-every-rejects-bad-intervals`, `routines.check-time-zone`
- Task: HAL-909, from HAL-902 point 6
- Approval: the maintainer decided the rule on HAL-909 and approves this change in review

## What changes

Only error messages; every expression and interval that was rejected is still rejected, and nothing new is.

- Every message ends with a full stop.
- `Bad part`, `Bad step in` and `Bad range` become sentences that start with the quoted part, for example `"x" is not a valid part.` and `"*/0" needs a step that is a whole number of 1 or more.`
- A bad cron field is prefixed with its name: `Minute: "60" is outside 0-59.`
- The interval hint reads `Use for example "15m", "1h" or "1d".`

## Why

Studio shows these messages under a field as they are, so they must read as sentences.

No test was weakened: each one now checks the whole new message.
