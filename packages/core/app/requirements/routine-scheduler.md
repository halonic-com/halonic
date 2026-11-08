# app.routine-scheduler

- Status: active
- Since: 0.1.0
- Source: no timers in core; ticks can come late or twice; catch-up policy for missed ticks

When the `Scheduler` port ticks, the routine scheduler shall ask the routines tick function what is due between the last tick and the clock's time, start each due run through the `RunExecutor` with the routine's trigger and a run id made from the workspace, the routine key and the due time, and then store the clock's time as the workspace's last tick in `Coordination`. The workspace shall be named by an id that stays the same on every host that ticks it, not by where a host keeps the files. If the clock's time is not after the stored last tick, then the tick shall start nothing. While a tick runs, another tick of the same scheduler shall start nothing. If a due run fails to start, then the scheduler shall report it and still start the others. When the scheduler is disposed during a tick, it shall start no more runs in that tick, store no last tick if it left due runs unstarted, and resolve only once that tick has settled. Run ids and the last-tick key shall stay within 256 UTF-8 bytes however long the routine key or workspace id is.

## Examples

- Given a routine due every hour, a last tick at 07:00:30 and no ticks while the laptop slept,
  when the scheduler ticks at 10:00:30 under a "run all missed" policy,
  then it starts the runs due at 08:00, 09:00 and 10:00, once each, and stores 10:00:30.
- Given a tick at 08:00:20 that started the 08:00 run,
  when the same tick is delivered again, or a late tick arrives with an earlier clock,
  then nothing new starts.
- Given the last tick was not stored because the host stopped after starting the runs,
  when the next tick asks again,
  then the starts repeat with the same run ids and the executor returns the runs that exist.
- Given two hosts ticking the same workspace,
  when both tick at 08:00:20,
  then the 08:00 run exists once.
- Given two hosts that keep the same workspace's files at different paths and both pass its stable id,
  when both tick at 08:00:20,
  then the 08:00 run exists once; had each passed its own path, it would have started twice.
- Given a routine that runs one agent,
  when it is due,
  then `startAgent` gets the trigger and the run id.
- Given two due routines where the first fails to start,
  when the scheduler ticks,
  then the second starts and the failure is reported in `routines.ticked`.
- Given two workspaces with a routine `@workspace/hourly` that share one `Coordination` and one run store,
  when both tick at 08:00:20,
  then each starts its own 08:00 run.
- Given a tick waiting on a slow start of the first of two due runs,
  when the scheduler is disposed,
  then the dispose resolves only after that start settles, the second run doesn't start, and the last tick stays as it was.
- Given a routine key that would make the run id longer than 256 bytes,
  when it is due,
  then the run id holds a hash of the key and is at most 256 bytes.
