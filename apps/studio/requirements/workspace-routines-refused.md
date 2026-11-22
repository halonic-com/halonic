# studio.workspace-routines-refused

- Status: draft
- Since: unreleased
- Source: flow check 38 (C552-5, HAL-15269); `app.scheduler-keeps-refused-starts`; `studio.engine-routines`

When the page's engine refuses a routine's start because its workflow has an agent with a connector only a terminal can start, the refusal's next step shall be "To keep it starting on time, run this in a terminal: halonic routines watch", since `halonic routines watch` starts the routine on time where `halonic run` starts it once; a refusal whose step is in Studio, such as an agent's Harness page, shall keep that step, as `halonic routines watch` refuses an agent in a harness program too. The Routines feature's host shall tell its listeners each time the engine's routine tick adds to a routine's skip records, also when no run started, give a refused start's next step with its skip, and give a routine's listing the time of its newest due time when that time's start was refused and no run of the routine started since; a routine whose skip records can't be read shall be listed as not refused, so one failed read doesn't fail the list.

## Examples

- Given a routine whose workflow's agent Writer lists the connector "notes", which the page can't start,
  when its 11:00 time comes,
  then the start is refused with that step, its skip row keeps it, and the host's listeners are told.
- Given the same routine whose agent runs in Claude Code where no agent host runs,
  then the refusal keeps "Set Writer to Halonic on its Harness page to run it now.".
- Given a routine whose newest skip row is a refused start at 19:41 and whose last run started at 19:40,
  then its listing says it was refused at 19:41; given a run started at 19:42, or a newer skip of another reason, it says nothing.
