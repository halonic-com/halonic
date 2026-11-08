# Decision: edits inside a one-line flow collection keep the layout

- Requirements: `yaml.edit-preserve` (`packages/core/yaml/requirements/edit-preserve.md`) and
  `yaml.edit-line-endings` (`packages/core/yaml/requirements/edit-line-endings.md`)
- Task: HAL-404, part 5 of the plan approved on HAL-424
- Approval: the approved plan asks for flow collections to be edited on their line and for new
  text to follow the file's indent; the maintainer approves it in review

## What changes

The requirements get stronger; nothing they promised before is taken away.

- `yaml.edit-preserve` loses the example "a value inside a flow list `[a, b]` is set, then the
  layout is `reformatted`". The new requirement `yaml.edit-style` covers that case, with the
  stronger answer: only that value's characters change and the layout is `kept`.
- The `yaml.edit-line-endings` example for a `reformatted` `\r\n` text now inserts into a flow list
  over two lines instead of setting an item of `[x]`. A one-line `[x]` no longer falls back, so
  that example would no longer reach the fallback it is about.

## Why

Parts 1 to 4 sent every edit inside a flow collection to the fallback, so `reformatted` was the
honest answer then. Now the splice handles them and leaves every other byte alone.

No test was weakened. The test that checked `reformatted` for `[a, b]` is replaced by tests under
`yaml.edit-style` that check the exact text and `kept`. The tests for the top comment on a
whole-document `set` and for `\r\n` in the fallback still check `reformatted` and the exact
text; they now use a flow list over two lines to reach that fallback.
