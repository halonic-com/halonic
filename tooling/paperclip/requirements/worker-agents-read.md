# paperclip.worker-agents-read

- Status: active
- Since: unreleased
- Source: HAL-16249; Liam's conditions in section 3 of addendum 2 on HAL-15997 (named columns only, no error text)

When the Worker agents page reads Paperclip's task and run tables, the Agent tools plugin shall only select named columns from the core tables its manifest lists, for one company, and shall never return a run's error text, log or output, or a task's title or description: a failed run's cause code is worked out in the database with the board check's patterns, so only the code reaches the plugin.

## Examples

- Given the three reads of the page,
  when they run,
  then each is a `SELECT` on `heartbeat_runs` or `issues` with the company as its first parameter, and none reads `agents`, whose rows hold adapter settings.
- Given a database row that also carries a made-up error text,
  when the plugin reads it,
  then the result holds only the named fields, and a cause outside the known codes becomes `other`.
