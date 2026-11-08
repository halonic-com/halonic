# Decision: `yaml.edit` reports the `kept` layout for spliced edits

- Requirement: `yaml.edit` (`packages/core/yaml/requirements/edit.md`)
- Task: HAL-404, part 2 of the plan approved on HAL-424
- Approval: the approved plan asks for the text splice that this change describes; the maintainer
  approves it in review

## What changes

The requirement gets stronger; nothing it promised before is taken away.

- The sentence on layouts now names all three values. Part 1 listed only `reformatted` and
  `rewritten`, although `kept` was already returned for a `set` that gives the value already there.
- The example `name: Billing # shown in the list` now expects the layout `kept` instead of
  `reformatted`: the splice changes only the value's characters. The text it expects is the same.

## Why

Part 1 rendered every edit again through the parsed document, so `reformatted` was the honest
answer then. With the splice, the same edit leaves every other byte alone, and the layout says so.

No test was weakened. The test for that example now checks `kept`, and the test for keeping the
top comment on a whole-document `set` still checks `reformatted` with the same expected text.
