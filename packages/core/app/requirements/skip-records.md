# app.skip-records

- Status: active
- Since: 0.1.0
- Source: HAL-642 (skip records, last 20 per routine), HAL-2542 (ranges with reason, count and the time they were decided) and HAL-2686 (`changed`, and a note for a lost queue); task HAL-2524

When the routine scheduler adds the due times a tick dropped for a routine, the app shall keep them as rows of reason, oldest time, newest time, count and the time the tick decided them, newest row first, at most 20 rows per routine, in a `Coordination` value of the routine's own. A dropped range shall continue the newest row when the reason is the same, it comes after that row's newest time, and no run of the routine was due in between; the row then gets its newest time, the sum of the counts and the new decision time. A range that a row with the same reason already holds shall add nothing. A count marked as a minimum shall keep the mark when merged. If another host stored the routine's rows since they were read, the app shall read them again and retry, up to three times. A routine's rows shall be readable without a tick, and a stored value that can't be read, or a row in it that isn't one, shall count as no rows. The app shall delete a removed routine's rows, and shall keep the time a workspace's stored queue was last found unreadable.

## Examples

- Given no rows for a routine,
  when a tick adds 19:00 Fri to 07:00 Mon, 61 times, `latest`, decided Mon 08:12,
  then the routine has that one row.
- Given a `busy` row 10:00 to 10:00, 1 time, and a last run due 09:00,
  when the next tick adds 11:00, `busy`,
  then the row becomes 10:00 to 11:00, 2 times, decided at the new tick.
- Given the same row and a last run due 10:30,
  when the next tick adds 11:00, `busy`,
  then 11:00 is a new row on top.
- Given a `cap` row on top of a `window` row from one tick,
  when the same tick's two ranges are added again,
  then the rows stay as they are.
- Given 20 rows,
  when a tick adds a new row,
  then the oldest row is gone.
- Given the stored rows aren't valid JSON,
  when they are read,
  then there are none.
