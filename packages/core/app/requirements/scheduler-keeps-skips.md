# app.scheduler-keeps-skips

- Status: active
- Since: 0.1.0
- Source: HAL-2524 (missed runs must leave a trace), HAL-540 (`trigger.catchUp`), HAL-2542 (reasons and counts), HAL-2686 (`changed`, a lost queue, no rows for deleted routines)

When a tick of the routine scheduler drops a due time, the routine scheduler shall add it to the routine's skip records (`app.skip-records`) before it starts anything, with the reason the tick function gives (`missed`, `latest`, `cap`, `window`), `busy` for a time the overlap rule dropped or that didn't fit the queue, or `changed` for a queued time whose routine still exists but is turned off or no longer runs at that time; the times one reason dropped for one routine in one tick shall make one range. A queued time of a removed routine shall get no record, and the scheduler shall delete a removed routine's records. If the stored queue can't be read, then the scheduler shall keep the time it found it so. When the scheduler starts a run the tick function marked as a catch-up, it shall pass `catchUp` on the run's trigger. A due time the overlap rule queued shall start later without `catchUp`, also when the tick function had marked it as one: the skip records keep what the catch-up rule dropped. If the skips of a routine can't be stored, then the tick shall report the routine and the error and still start its runs. A routine's records and the last queue loss shall be readable without a tick.

## Examples

- Given an hourly routine with `catchUp: last`, a last tick at Fri 18:00 and a tick at Mon 08:12,
  when the tick runs,
  then the 08:00 run starts with `trigger.catchUp: { skipped: 61 }`, and the routine has one `latest` row, 19:00 Fri to 07:00 Mon, 61 times.
- Given an hourly routine with `overlap: skip` whose 08:00 run is still going,
  when ticks at 09:00 and 10:00 skip their times, the run ends, 11:00 starts and 12:00 is skipped,
  then the rows are 12:00 (1 time) and 09:00 to 10:00 (2 times), newest first.
- Given an hourly routine with `catchUp: all` and `overlap: queue`, a last tick at Fri 18:00 and a tick at Mon 08:12,
  when the 19:00 catch-up run ends and the next tick runs,
  then the 20:00 run starts without `trigger.catchUp`.
- Given a queued 09:00 time and the routine moved to minute 30,
  when the next tick runs,
  then the routine has a `changed` row for 09:00.
- Given a removed routine with rows, and a stored queue that isn't valid JSON,
  when the next tick runs,
  then the routine has no rows and the last queue loss is the tick's time.
