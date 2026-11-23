# paperclip.difficulty-tagger

- Status: active
- Since: unreleased
- Source: HAL-16901; the tagger prompt in the `difficulty-labels` document on HAL-16876 (board, Part 2, 23 Nov)

When a task is created or changes and its title or the first 4,000 characters of its description differ from what the tagger last read on that task, the Agent tools plugin shall, only while the board's switch `difficultyTaggerForVersion` names the running version and the tagger's Anthropic key and Paperclip's API address and key are set, send that text with the board's tagger prompt to `claude-haiku-5-5` with thinking off and `max_tokens` 400, using the key only as that request's `x-api-key`, and set the task's difficulty labels to the answer's `D1`–`D4`, plus `opus-only` when `opus_only` is true, when `kind` is `code`, and to none for any other kind, keeping every other label; it shall write no difficulty label and make no call on a task whose `D1`–`D5` or `opus-only` labels differ from the ones it wrote last, so a label a person or Chief set always wins; it shall treat an answer that isn't the prompt's JSON as unreadable and write nothing; and it shall put neither task text nor the key in a log line or a metric.

## Examples

- Given the switch on and a new task "Fix the typo in the CLI help" with no labels,
  when Haiku answers `{"kind":"code","difficulty":"D1","opus_only":false,…}`,
  then the plugin sends one request with model `claude-haiku-5-5`, `max_tokens` 400 and thinking disabled, sets the task's labels to `D1`, and logs "labelled HAL-… D1".
- Given a code task Haiku tags `D3` with `opus_only` true, which already has the label `studio`,
  when the plugin labels it,
  then the task has `studio`, `D3` and `opus-only`.
- Given a task Haiku answers `{"kind":"review",…}`,
  when the plugin handles it,
  then it writes no label.
- Given a task Chief labelled `D2`,
  when its description changes,
  then the plugin makes no call and leaves `D2`.
- Given a task the plugin labelled `D1`,
  when someone changes it to `D4`, or takes `D1` off, and then its title changes,
  then the plugin makes no call and writes nothing.
- Given a new task,
  when someone labels it `D3` while Haiku answers `D1`,
  then the plugin reads the task again before writing and leaves `D3`.
- Given a task the plugin labelled `D2`,
  when its description grows into a bigger change and Haiku answers `D4`,
  then the plugin changes `D2` to `D4`.
- Given a task the plugin already tagged,
  when only its status or assignee changes,
  then the plugin makes no call.
- Given the switch empty or naming another version,
  when a task is created,
  then the plugin makes no call and writes nothing.
- Given Anthropic answers 401,
  when the plugin asks about a task,
  then it logs an error with `http_401` and saves `difficulty_tagger.failed`, and neither the log nor the metric holds the key or the task's text.
