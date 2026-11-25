# paperclip-client.team-status-fields

- Status: active
- Since: unreleased
- Source: HAL-17712 plan (table 1.6 fields, approved by Liam); tasks HAL-17735, HAL-17898 and HAL-18040

The Paperclip provider shall give a seat whose newest read failed for a reason other than being signed out a `failedRead`: `rate-limited` when the `halonic.seats` plugin's `lastError` says so and `other` for any other error, at the plugin's `failedReadAt` (the summary's time when the plugin doesn't send it), with `state: "not-read"` and the plugin's last good windows and `asOf` unchanged. A seat that is signed out, or not read without an error, shall have no `failedRead`. Spend shall give `unknownSeatRuns` as the plugin's count of runs since the range's start with cost rows but no seat, and leave it out when the plugin isn't installed, sends no count or its read fails for any reason, because Paperclip's cost routes don't say which seat a run used. A failed seats read shall not fail the spend read: its paid money and tokens are given as without the plugin, and only a 404 marks the seats part as not served. The spend read inside `refresh` shall not ask the plugin for the count. No answer shall carry `fromCache`, because the provider reads live and keeps no cache. The provider shall pass the `TeamStatus` contract.

## Examples

- Given a seat the plugin couldn't read because it was rate-limited, with windows and `asOf` from 09:50,
  when the seats are read,
  then its state is `not-read`, its `failedRead` is `rate-limited` at the time that read ran, and its windows and `asOf` are the 09:50 reading's.
- Given a seat whose read timed out, from a plugin that doesn't send `failedReadAt`,
  when the seats are read,
  then its `failedRead` cause is `other`, at the summary's time.
- Given a signed-out seat, and a seat not read without an error,
  when the seats are read,
  then neither has a `failedRead`.
- Given a seats plugin that counts 3 runs with no seat since the week's start,
  when the week's spend is read,
  then its `unknownSeatRuns` is 3.
- Given no seats plugin, or one that sends no count,
  when spend is read,
  then it has no `unknownSeatRuns`.
- Given a seats plugin whose summary answers 500, or 400,
  when today's spend is read,
  then it has the paid money and tokens, no `unknownSeatRuns`, and the seats part is still served.
- Given a connected provider,
  when it refreshes,
  then its seats reads carry no `from`.
- Given a connected provider,
  when spend and seats are read,
  then no answer has `fromCache`.
