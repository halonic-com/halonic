# app.scheduler-reads-queue

- Status: active
- Since: 0.1.0
- Source: HAL-2686 and HAL-2524; Studio's Runs view shows a routine's queued times as one row ("14:00 Wed 4 Nov to 08:00 Mon: 99 times waiting to start"), and the old Studio kept the queue in memory where nothing could read it

When a caller asks the routine scheduler for its queued times, the routine scheduler shall return, for each routine with at least one due time in the workspace's stored queue, the routine key, the number of queued times, and the oldest and newest queued time, ordered by routine key. It shall read them from the stored queue as the last tick left it, without ticking and without starting, queueing or skipping anything, so the answer is the same before and after a restart. A routine with no queued times shall be left out. A stored queue that can't be read shall count as empty.

## Examples

- Given an hourly routine with `overlap: queue` whose 08:00 run is still going, and ticks that queued 09:00 and 10:00,
  when a caller asks for the queued times,
  then it gets one entry for that routine: 2 times, first 09:00, last 10:00.
- Given the same stored queue and a new scheduler for the workspace, as after a restart,
  when a caller asks before any tick,
  then it gets the same entry.
- Given nothing queued, or a stored queue that isn't valid JSON,
  when a caller asks for the queued times,
  then it gets an empty list.
