# paperclip-client.team-run-again-ended

- Status: active
- Since: unreleased
- Source: Runs app build plan (HAL-18624); the maintainer's review of PR 3 (HAL-18695), carried into HAL-18725

While a team run is queued or running, or its task is `blocked` or `in_review`, the Paperclip provider shall not offer Run again for it and shall refuse Run again as `not-allowed`, sending no wake, because the wake sets the task to `todo` and would clear the block or the review.

## Examples

- Given a run that is still running,
  when Run again is checked or asked for,
  then it isn't offered, the answer is refused as not allowed, and no request changes the task.
- Given a failed run whose task is blocked,
  when Run again is checked,
  then it isn't offered, with the task's short name, and no wake is sent.
