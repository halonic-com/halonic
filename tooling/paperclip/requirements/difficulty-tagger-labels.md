# paperclip.difficulty-tagger-labels

- Status: active
- Since: unreleased
- Source: HAL-16902; the board's tagger proposal in HAL-16876's document `difficulty-labels`, 23 Nov

When the difficulty tagger reads the model's answer about a task, the Agent tools plugin shall accept only a JSON object whose `kind` is one of `code`, `review`, `docs`, `research`, `ops` or `other`, whose `difficulty` is one of `D1` to `D4` and whose `opus_only` is a boolean, and treat anything else as no answer; it shall answer the labels `<difficulty>`, plus `opus-only` when `opus_only` is true, for `code` work and no labels for any other kind; it shall leave a task alone that carries a `D1`–`D5` or `opus-only` label it didn't write itself, compared without regard to case or surrounding spaces; and when it tags a task again it shall replace only the labels it wrote and keep every other label.

## Examples

- Given the answer `{"kind": "code", "difficulty": "D3", "opus_only": true, "specified": false, "model": "opus", "path": "full"}`,
  when the tagger reads it,
  then the labels are `D3` and `opus-only`.
- Given the answer `{"kind": "review", "difficulty": "D2", "opus_only": false}`,
  when the tagger reads it,
  then there are no labels.
- Given the answer `{"kind": "code", "difficulty": "D9", "opus_only": false}` or text that isn't JSON,
  when the tagger reads it,
  then it is no answer.
- Given a task Chief labelled `D2`,
  when its description changes,
  then the tagger asks nothing and changes no label.
- Given a task the tagger labelled `D2` that also has the label `studio`,
  when its description changes and the answer is `D4` with `opus_only` true,
  then its labels become `studio`, `D4` and `opus-only`.
