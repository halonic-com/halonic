# router.unhealthy-alias-rule

- Status: active
- Since: unreleased
- Source: HAL-17000; hard rule 7 in architecture note section 4, and Q3 in section 10, on HAL-16984

When the router applies hard rule 7, it shall remove every workflow with any step on an alias the health check has taken out, naming the workflow and those aliases, and shall keep every other workflow unchanged and in order, never swapping a step's alias for another.

## Examples

- Given `W-d3-cascade` (DeepSeek writes, Opus fixes) and `W-opus`, with `deepseek-flash` out,
  when hard rule 7 is applied,
  then `W-d3-cascade` is removed, naming `deepseek-flash`, and `W-opus` is kept.
- Given only `W-d3-cascade`, with `opus` out,
  when hard rule 7 is applied,
  then nothing is left, so the router gives the task the fallback.
- Given every alias healthy,
  when hard rule 7 is applied,
  then every workflow is kept, in order.
