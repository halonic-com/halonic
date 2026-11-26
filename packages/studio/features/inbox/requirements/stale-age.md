# inbox.stale-age

- Status: active
- Since: unreleased
- Source: HAL-19190 (board report on HAL-10: the installed Inbox said the engine isn't answering and showed old items)

When a later load of the Inbox fails, the callout over the list shall end with when the list was last read in full ("Last updated 10:43."). When the engine answered with a refusal, such as the agent host's, the callout shall give that refusal's reason and say it is showing what was read last, instead of saying the engine isn't answering.

## Examples

- Given an Inbox read in full at 10:43 whose next load the agent host refuses ("The agent host refused the read."),
  then the callout says "The agent host refused the read. Showing what was read last. Last updated 10:43."
