# paperclip.seats-read-schedule

- Status: active
- Since: unreleased
- Source: HAL-16008; `seats.read` every 10 minutes spread across the seats, for the seat forecast on HAL-15997, with a fixed offset per seat as agreed on HAL-16030

When the `seats` plugin schedules its reads, it shall read each seat at the same minute inside every 10-minute bucket, from minute 1 to minute 8 by the seat's place in the board's seat list, so that adding a seat at the end moves no other seat.

## Examples

- Given seats A, B and C,
  when their reads are scheduled,
  then they are read at minutes 1, 2 and 3 of each bucket.
- Given a seat D added after them,
  when the reads are scheduled,
  then A, B and C keep their minutes and D is read at minute 4.
- Given a seat read at minute 2 and the time 09:02,
  when its next read is scheduled,
  then it is at 09:12.
