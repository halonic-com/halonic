# inbox.stale-age

- Status: active
- Since: unreleased
- Source: HAL-19190 (board report on HAL-10: the installed Inbox said the engine isn't answering and showed old items); HAL-19449

When a later load of the Inbox fails, the callout over the list shall end with when the list was last read in full ("Last updated 10:43."). When the engine answered with a refusal, such as the agent host's, the callout shall give that refusal's reason and say it is showing what was read last, instead of saying the engine isn't answering. When the load failed because the served Studio's sign-in ended, the callout shall say only to sign in again, with no "Last updated" and no "Showing what was read last." (HAL-13371).

## Examples

- Given an Inbox read in full at 10:43 whose next load the agent host refuses ("The agent host refused the read."),
  then the callout says "The agent host refused the read. Showing what was read last. Last updated 10:43."
- Given an Inbox whose next load fails because the sign-in ended ("Sign in again to list what waits for you."),
  then the callout says "Sign in again to list what waits for you." and nothing more.
