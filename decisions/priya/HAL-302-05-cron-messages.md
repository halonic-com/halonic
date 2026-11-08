# Decision: clearer messages in `routines.cron-rejects-bad-expressions`

- Requirement: `routines.cron-rejects-bad-expressions` (`packages/core/routines/requirements/cron-rejects-bad-expressions.md`)
- Task: HAL-302, from the maintainer's review of #165 in HAL-431
- Approval: the maintainer asked for both changes in that review and approves this one in review

## What changes

Only error messages; every expression that was rejected is still rejected, and nothing new is.

- A range with an empty end names the range and the part: `1-/5` now says `Bad range "1-" in "1-/5"` instead of `"" is not a number`. The example in the requirement changes to match.
- An unknown macro says so: `@reboot` now says `Unknown macro "@reboot"; use one of @hourly, …` instead of "Cron needs 5 fields …, got 1". The requirement gains this example.

## Why

The old messages pointed at the wrong thing: an empty string the user never typed, or a field count
for something that was never meant to have fields.

No test was weakened: the `1-/5` test checks the new, more specific message, and the macro has a new test.
