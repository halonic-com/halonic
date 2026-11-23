# paperclip.difficulty-tagger-spend

- Status: active
- Since: unreleased
- Source: HAL-16901 point 4 (board, 23 Nov): stop tagging and report on the Agent tools page past $5 a month

While the difficulty tagger's spend in the current calendar month (UTC), counted from each answer's input and output tokens at $1 and $5 per million, is $5 or more, the Agent tools plugin shall send no request to Anthropic, shall log one error on its plugin page that month saying that the tagger stopped, the month and the spend, and shall save the `difficulty_tagger.stopped` metric once with the month; it shall count every answered call, readable or not, and save each call's cost as `difficulty_tagger.spend_micro_usd`; and it shall count one call at a time, so two tasks tagged at once never count from the same total.

## Examples

- Given a November spend of $4.9999 and a new task,
  when Haiku answers with 1,000 input and 40 output tokens,
  then the plugin labels the task and the November spend becomes $5.0011.
- Given a November spend of $5.0011,
  when two more tasks are created in November,
  then the plugin sends no request, logs "Difficulty tagger: stopped for 2026-11, spend $5.00 …" once and saves `difficulty_tagger.stopped` once.
- Given a November spend of $5.0011,
  when a task is created on 1 December,
  then the plugin asks Haiku again and counts from $0.
