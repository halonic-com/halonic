# paperclip.thin-spec-check

- Status: active
- Since: unreleased
- Source: HAL-17076, board request HAL-17072 (23 Nov); prompt, schema, features and threshold ported from halonic-com/variant-router `enrich.py` and `thin_spec.py`

When a task is created or changes, and it is assigned to an agent, has the status `backlog` or `todo`, has a `D1`–`D4` label, was created at most 24 hours ago, isn't a clarify task and was never checked before, the Agent tools plugin shall, only while the board's switch `thinSpecCheckForVersion` names the running version, a fitted model is built in, the tagger's Anthropic key and Paperclip's API address and key are set and the check's spend this month is under $5, send the task's title and the first 4,000 characters of its description with the trial's triage prompt and answer schema to `claude-haiku-5-5`, score the reading with the fitted model, and flag the task when the score is above 0.5; for a flagged task it shall first read the task again and, if its status is no longer `backlog` or `todo`, add nothing and log `writer_started`; otherwise it shall create a todo task titled "Clarify acceptance criteria: …" under it, in the flagged task's project and goal, assigned to the agent that created the task (or, for a task a person or its own writer created, the board's clarifier agent), and set the flagged task to `blocked` by that task, keeping its other blockers; it shall never change a task's title, description or assignee, and leave an unflagged task untouched; it shall log every check (task, flagged, score, clarify task or why there is none) on the task and in that day's company log; after a call that failed or an answer that isn't the schema's JSON it shall keep no record, so the task's next event asks again; and it shall put neither task text nor a key in a log line or a metric.

## Examples

- Given the switch on and a new D2 task assigned to an agent, created by Chief,
  when Haiku's reading scores 0.81,
  then the plugin creates "Clarify acceptance criteria: HAL-1 …" assigned to Chief, sets HAL-1 `blocked` by it, and logs "HAL-1 flagged, score 0.81".
- Given a flagged task that was already blocked by HAL-7,
  when the plugin adds the clarify task,
  then HAL-1 is blocked by HAL-7 and the clarify task.
- Given a new D1 task whose reading scores 0.20,
  when the plugin checks it,
  then it creates no task, changes nothing on the task, and logs "HAL-1 clear, score 0.20".
- Given a flagged task a person created and no clarifier set,
  when the plugin checks it,
  then it creates no task, logs the check with `no_clarifier` and saves `thin_spec.failed`.
- Given a task already checked,
  when it is edited or reassigned,
  then the plugin makes no call.
- Given a task without a `D1`–`D4` label, one in progress, one created two days ago, or a clarify task,
  when it changes,
  then the plugin makes no call.
- Given the switch empty or naming another version, or no fitted model,
  when a code task is assigned,
  then the plugin makes no call and writes nothing.
- Given Anthropic answers 500,
  when the task changes again,
  then the plugin asks again.
