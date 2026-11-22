# paperclip.seats-read-watch

- Status: active
- Since: unreleased
- Source: HAL-16008; `seats.read` in the seat forecast on HAL-15997 (section 4.1); the rate-limit test on HAL-16031 (10-minute reads, keep the back-off)

When `seats.read` has read a seat, it shall read it again at its own offset in the next bucket, or after a rate limit two, four and at most six buckets later, it shall never start a round while one is still running, and it shall raise an alert for a seat that is signed out, not on a subscription, on another account, whose sign-in has expired or expires within a day, or that has had no good reading for three reads.

## Examples

- Given a good read at 10:03 for a seat read at minute 3,
  when the next read is planned,
  then it is at 10:13.
- Given a third rate limit in a row at 10:03,
  when the next read is planned,
  then it is at 11:03, and a good read after that brings it back to every 10 minutes.
- Given a round that is still reading,
  when the next round starts,
  then it is skipped and reads no seat.
- Given a sign-in that expires in 2 hours,
  when the alerts are listed,
  then the seat has `sign-in-expiring`.
- Given a seat whose last good reading is 31 minutes old,
  when the alerts are listed,
  then the seat has `readings-stopped`.
