# paperclip-client.team-status-fields

- Status: active
- Since: unreleased
- Source: HAL-17712 plan (table 1.6 fields, approved by Liam); task HAL-17735

The Paperclip provider shall give a seat whose newest read failed for a reason other than being signed out a `failedRead`: `rate-limited` when the `halonic.seats` plugin's `lastError` says so and `other` for any other error, at the summary's time, with `state: "not-read"` and the plugin's last good windows and `asOf` unchanged. A seat that is signed out, or not read without an error, shall have no `failedRead`. Spend shall leave out `unknownSeatRuns`, because Paperclip's cost routes don't say which seat a run used, and no answer shall carry `fromCache`, because the provider reads live and keeps no cache. The provider shall pass the `TeamStatus` contract.

## Examples

- Given a seat the plugin couldn't read because it was rate-limited, with windows and `asOf` from 09:50,
  when the seats are read,
  then its state is `not-read`, its `failedRead` is `rate-limited` at the summary's time, and its windows and `asOf` are the 09:50 reading's.
- Given a seat whose read timed out,
  when the seats are read,
  then its `failedRead` cause is `other`.
- Given a signed-out seat, and a seat not read without an error,
  when the seats are read,
  then neither has a `failedRead`.
- Given a connected provider,
  when spend and seats are read,
  then no spend has `unknownSeatRuns` and no answer has `fromCache`.
