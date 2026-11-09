# app.routine-overlap

- Status: active
- Since: 0.1.0
- Source: HAL-1007; the old `dueRoutines` (784f78d `schedule.ts`) applied each routine's `overlap` setting while a run was busy

When a routine has a due time while a run of it that the workspace's scheduler started is still running or waiting, the routine scheduler shall follow the routine's `overlap` setting: with `skip` it shall drop the time and report it as skipped, with `queue` it shall keep the time in `Coordination` and start it on a later tick once the routine is free, and with `allow` it shall start it anyway. A routine that doesn't allow overlap shall start at most one run per tick, its queued times first, oldest first. A queued time shall start only if the routine still exists, is enabled and still runs at that time. A routine shall keep at most 100 queued times, and the workspace's queue shall fit in one `Coordination` value; the newest times past either limit shall be reported as skipped. Runs of other workspaces, and a due time whose own run is still going, shall not count. A stored queue that can't be read shall count as empty. If another host changed the stored queue since the tick read it, the routine scheduler shall not store the last tick, so a later tick asks for the tick's due times again.

## Examples

- Given an hourly routine whose 09:00 run is still going,
  when the scheduler ticks at 10:00:10,
  then with `overlap: skip` it reports 10:00 as skipped, with `queue` it reports 10:00 as queued, and with `allow` it starts the 10:00 run.
- Given the 10:00 time queued and the 09:00 run ended,
  when the scheduler ticks at 10:20,
  then it starts the 10:00 run and the queue is empty.
- Given an hourly routine with `catchUp: all` and `overlap: queue`, and no ticks from 07:59 to 10:40,
  when the scheduler ticks,
  then it starts 08:00 and queues 09:00 and 10:00; once the 08:00 run ends, the next tick starts 09:00.
- Given an hourly routine with `overlap: queue` whose 08:00 run is still going, and another host that stores its queue while this host ticks at 09:00:20,
  when this host's queue write loses,
  then it doesn't store the last tick, and once the 08:00 run ends, the next tick starts 09:00.
- Given a queued time of a routine that was deleted since,
  when the scheduler ticks,
  then the time is dropped without starting.
