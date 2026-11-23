# agent-host.engine-run-updates-feed

- Status: active
- Since: unreleased
- Source: HAL-14217; HAL-17004; design note D3 on HAL-14206

While anyone follows the engine role's run updates feed, the feed shall read the engine's runs every second and send one frame for each run whose status changed since the last read, with the run's id, its new status and the `seq` of its latest event. The feed shall keep no history: the first read after nobody followed shall send nothing. While nobody follows, it shall not read the runs. If a read fails, then the feed shall report it and read again on the next tick.

## Examples

- Given a followed feed and a run that was `running`,
  when the run waits with 5 events in its log,
  then the feed sends `{ "runId": …, "status": "waiting", "seq": 5 }` once.
- Given a run whose log grew without a status change,
  when the feed reads,
  then it sends nothing.
- Given a feed nobody follows,
  when a run ends and someone then follows,
  then that change is never sent.
