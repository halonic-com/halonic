# paperclip.seats-summary-fields

- Status: active
- Since: unreleased
- Source: HAL-17898, the follow-up to HAL-17735 for the `TeamStatus` table 1.6 fields `Seat.failedRead` and `SpendSummary.unknownSeatRuns`

When a board user asks the `seats` plugin's `GET /seats/summary` route, the plugin shall give each seat whose newest read failed the time that read ran (`failedReadAt`), and no such time to a seat whose newest read was good or never ran. When the request carries a `from` time, the plugin shall also give `unknownSeatRuns`: how many distinct runs with Paperclip cost rows at or after `from` were on no seat, where a run with any row on a seat counts as seated. Without `from` the answer shall have no count and the plugin shall read no cost rows. The plugin shall refuse with 400, before it reads any cost rows, a `from` that isn't a time, is after now or is more than 31 days back.

## Examples

- Given a seat whose newest read, at 11:50, failed because it was signed out,
  when a board user asks for the summary,
  then the seat's `lastError` is `signed-out` and its `failedReadAt` is 11:50.
- Given a run whose cost rows were made before its agent had a seat, a run of an agent never on a seat, and a run on a seat,
  when a board user asks for the summary with a `from` before all three,
  then `unknownSeatRuns` is 2.
- Given a summary request without `from`,
  when a board user asks for it,
  then the answer has no `unknownSeatRuns`.
- Given a `from` of `yesterday`, an hour from now or 32 days ago,
  when a board user asks for the summary,
  then the plugin refuses with 400.
