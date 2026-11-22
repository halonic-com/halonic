# cli.run-live-failed-call

- Status: active
- Since: unreleased
- Source: HAL-15560 (follow-up of HAL-15149: `halonic runs show` says why a step's tool call didn't work, `halonic run` didn't yet)

When `halonic run` prints a step's finished line as the step ends (`cli.run-live`), it shall print right after it the lines `halonic runs show` prints under the same step for its tool calls that failed (`cli.run-view-failed-call`), in the same words, and its result shall repeat the step's line and those lines word for word (`cli.print-ahead`). A step that is still running shall get none of them until it ends.

## Examples

- Given the Acme example and Sam's email, where Read the email called `search_pages`, which broke off without an answer,
  when `halonic run support-reply` has finished Read the email,
  then "✓ Read the email Writer · smart 1 s" is printed followed at once by "  Didn't work: the tool search_pages broke off without an answer, so it may or may not have done its work.", before Classify it's line, and the result repeats both.
