# paperclip.difficulty-tagger-writes

- Status: active
- Since: unreleased
- Source: HAL-16902; the board's tagger proposal in HAL-16876's document `difficulty-labels`, 23 Nov

When a task that isn't done or cancelled is created, or its title or the first 4,000 characters of its description change, and the board set an Anthropic API key in the settings, the Agent tools plugin shall send one request to `https://api.anthropic.com/v1/messages` with that key, the model in its settings (`claude-haiku-5-5` by default), the board's tagger prompt as the system prompt, thinking off, at most 400 output tokens, and the task's title followed by the first 4,000 characters of its description; it shall set the task's labels through the plugin SDK, with the label ids it reads from Paperclip's API at the address and with the key in its settings, only while the board's switch allows the running version to write and that address and key are set, and otherwise log "would label" with the task and the labels; it shall ask again about the same text only when the switch changed since; it shall save no record when the request or the write fails, so the task's next change tries again; and it shall put no task text, model text or key in a log line, a metric or its saved record.

## Examples

- Given a new task "Fix the typo in the CLI help" assigned to Mateo, the key set and the switch on,
  when the model answers code, `D1`, not opus-only,
  then the plugin sets the task's labels to the id of `D1`, logs "Difficulty tagger: labelled HAL-1 D1." and saves `difficulty_tagger.set` with `kind: code`.
- Given the same task with the switch empty or set to another version,
  when the plugin handles its `issue.created`,
  then it changes no label, logs "Difficulty tagger: would label HAL-1 D1 (switch off)." and saves `difficulty_tagger.logged`.
- Given a task the tagger already labelled,
  when only its status or assignee changes, or its own label change comes back as `issue.updated`,
  then the plugin sends no request.
- Given no Anthropic key in the settings, or a done task,
  when the task changes,
  then the plugin sends no request.
- Given Anthropic answers 429,
  when the plugin asks about a task,
  then it logs an error with `http_429`, saves `difficulty_tagger.failed` with `reason: http_429`, and asks again on the task's next change.
