# paperclip.merge-control-stall

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); HAL-16528

When one of the first three queue entries has waited for checks more than 30 minutes and every merge-group run of its group has finished, the plugin shall rerun each of those runs that didn't pass.

## Examples

- Given a front entry 45 minutes old with one failed and one passed run,
  when a pass runs,
  then the failed run is rerun.
- Given a run still going, an entry 10 minutes old or one at position 4,
  when a pass runs,
  then nothing is rerun.
