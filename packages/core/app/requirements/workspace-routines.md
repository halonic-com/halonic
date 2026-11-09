# app.workspace-routines

- Status: active
- Since: 0.1.0
- Source: HAL-133 item 2 (HAL-924); the old `Studio` filled the trigger templates when it started a routine

When a workspace's routine scheduler ticks, it shall decide what is due with the routines tick function `due`, under each routine's `catchUp` setting, and start each due run with its `{{trigger.at}}` and `{{trigger.lastRun}}` placeholders filled in by `routineStart`. `trigger.at` shall be the run's due time, and `trigger.lastRun` the due time of the last run of the same routine that the scheduler started in this workspace, or `null` before the first one. A routine at the workspace level whose target names no hub shall be reported as failing to start.

## Examples

- Given a routine file with `schedule: "0 8 * * *"`, a workflow input `{ day: "{{trigger.at}}", since: "{{trigger.lastRun}}" }` and a last tick at 07:30,
  when the scheduler ticks at 08:00:20,
  then the workflow starts with `{ day: "<08:00 that day>", since: null }`, and on the next day with `since` set to the first day's 08:00.
- Given a routine file with `every: "15m"` and `catchUp: "last"`, a last tick at 08:01 and no ticks until 08:40,
  when the scheduler ticks,
  then it starts only the 08:30 run.
- Given a routine with `catchUp: "all"`, `overlap: "allow"` and three missed hours,
  when the scheduler ticks,
  then it starts the three runs oldest first, each with the one before as its `trigger.lastRun`.
- Given a tick that started the 08:00 run,
  when a second tick comes at the same time,
  then it starts nothing, and a start that is repeated gets the same run id.
- Given a workspace routine whose `run` names no hub,
  when it is due,
  then the tick reports it in `failed` and starts the other routines.
