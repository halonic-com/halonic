# paperclip.merge-control-other-base

- Status: active
- Since: unreleased
- Source: HAL-19508; #6416, the live Merger since 26 Nov 09:11 UTC (HAL-18424, Chief 26 Nov 08:58)

When an open pull request targets a base other than `main`, the plugin shall give the gate reason `targets <base>, not main (stacked PR): it queues once its base merges and it is retargeted` if the base is an open pull request's branch or the open pull requests couldn't be read, and `targets <base>, not main: retarget to main, or the release captain merges it into the release branch` otherwise.

## Examples

- Given #6416 on `release/0.1.3`, which is no open pull request's branch,
  when the gate runs,
  then its reason says to retarget to main or leave it to the release captain, and doesn't say stacked.
- Given #2 on the branch of open #1,
  when the gate runs,
  then its reason says stacked PR, as before.
