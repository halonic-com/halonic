# paperclip-client.stepper-result-server-session

- Status: active
- Since: unreleased
- Source: stream HAL-17488; plan on HAL-18256, section 1 and PR B; Liam's split on HAL-20454; task HAL-20464

When Studio answers a stepper item whose request is a `server-session` block for task HAL-n with an `action-result` in which that block succeeded, the provider shall write that block's result in the document `stepper-result` as exactly "Started a server session on <day> for HAL-n", where <day> is the day Studio answered in UTC, such as "27 Nov 2026", and its summary comment shall begin with the same sentence.

## Examples

- Given a request with one `server-session` block for HAL-1234,
  when Studio answers on 27 Nov 2026 that the block succeeded,
  then `stepper-result` says "Started a server session on 27 Nov 2026 for HAL-1234" for the block, and so does the summary comment.
