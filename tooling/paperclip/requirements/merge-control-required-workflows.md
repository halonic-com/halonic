# paperclip.merge-control-required-workflows

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); MERGER.md §4 rule 8; #4198, #4292, HAL-14893

When the gate checks a pull request, the plugin shall require the newest run of `Guard notes` and of `Built-on label` on its head, created after its last retarget, to have passed.

## Examples

- Given a pull request retargeted after its workflow runs,
  when a pass runs,
  then both are reported as not run and it isn't enqueued.
- Given an older failed and a newer green `Built-on label`, a running `Guard notes`, or a failed newest one,
  when they are checked,
  then the first passes, the second is pending and the third is reported as failed.
