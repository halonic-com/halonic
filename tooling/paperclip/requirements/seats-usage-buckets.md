# paperclip.seats-usage-buckets

- Status: active
- Since: unreleased
- Source: HAL-16008; tokens per agent per 10 minutes for the seat forecast on HAL-15997, in the records agreed on HAL-16030

When the `seats` plugin turns Paperclip's cost rows into usage, it shall add up each agent's input, cached input and output tokens and count its distinct runs per 10-minute bucket starting on the UTC ten minutes, keep apart each seat and model, and put each row in the bucket of its own time on the seat the agent was on at that time.

## Examples

- Given two rows of one run and one row of another, all at 08:2x on one seat and model,
  when they are bucketed,
  then the 08:20 bucket holds their summed tokens and two runs.
- Given rows at 09:02 and 09:08 for an agent moved from seat A to seat B at 09:05,
  when they are bucketed,
  then the 09:00 bucket has one row for seat A and one for seat B.
- Given a row from an agent with no placement at that time,
  when it is bucketed,
  then its seat is unknown.
