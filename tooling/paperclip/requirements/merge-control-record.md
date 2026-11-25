# paperclip.merge-control-record

- Status: active
- Since: unreleased
- Source: HAL-17704; the merge controller ADR (HAL-17700)

When a merge-control pass is recorded, the plugin shall keep its snapshot, the pull requests that passed the gate and its actions with their cost in plugin state for 14 days, without the text of any comment, review or log, and shall give the simulator a day from the recorded passes.

## Examples

- Given a pull request with a comment saying "private words",
  when its pass is recorded,
  then the record holds no comment text.
- Given passes on 1 Nov and on 15 Nov,
  when the 15 Nov pass is saved,
  then the 1 Nov passes are deleted.
- Given a fast-track pull request ready in one pass and a failed group of another in the next,
  when the day is built from the records,
  then the first is fast-track and the second fails its first group.
