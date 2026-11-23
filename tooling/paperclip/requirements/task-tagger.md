# paperclip.task-tagger

- Status: active
- Since: unreleased
- Source: HAL-16928; the board's comments on HAL-16876 (23 Nov) and its `difficulty-labels` document

When a task is created, or a task the Agent tools plugin has seen before changes its title or description, and the board's switch `taskTaggerWritesForVersion` names the running plugin version and the Anthropic key and Paperclip's API address and key are set, the plugin shall send the task's title and the first 4,000 characters of its description to Anthropic's Messages API with the board's tagger prompt, the model `claude-haiku-5-5`, thinking disabled and `max_tokens` 400, and, when the answer's `kind` is `code`, put the answer's difficulty label (`D1` to `D4`) and, when `opus_only` is true, the `opus-only` label on the task, replacing only the labels it wrote itself and keeping every other label; it shall write no label for other kinds and take off the labels it wrote when a later answer says so; it shall leave alone, from then on, a task that has a difficulty label (`D1` to `D5`) or `opus-only` it didn't write; it shall call nothing while the switch is off; it shall resolve the Anthropic key only for the call, send it only to `api.anthropic.com`, and put neither key nor task text in a log line, a metric or a task.

## Examples

- Given the switch on and a new task, when Haiku answers `{"kind": "code", "difficulty": "D2", "opus_only": false, …}`,
  then the plugin puts the `D2` label on the task, keeps its other labels, logs "HAL-… is code, D2" and saves `task_tagger.tagged`.
- Given the same task, when its description changes and Haiku now answers `D4` with `opus_only` true,
  then the plugin swaps `D2` for `D4` and `opus-only`; when only its status changes, the plugin calls nothing.
- Given Haiku answers `kind` `review`,
  when the plugin handles the task,
  then it writes no label.
- Given a new task created with the label `D1` by a person, or a task whose tagger label someone replaced,
  when the plugin handles it,
  then it calls nothing and writes nothing on that task again.
- Given the switch empty or naming another version,
  when a task is created,
  then the plugin sends no request and resolves no secret.
- Given a task the plugin first sees on an `issue.updated`,
  when it handles it,
  then it only keeps the task's text as the baseline, and tags it when the title or description changes later.
- Given Haiku answers 401, or with text that isn't the JSON asked for,
  when the plugin handles the task,
  then it logs an error with `http_401` or `unreadable` and saves `task_tagger.failed`; after a failed request it tries again on the task's next event.
