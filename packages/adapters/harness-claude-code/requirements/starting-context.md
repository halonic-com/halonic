# harness-claude-code.starting-context

- Status: active
- Since: unreleased
- Source: HAL-17253 (token-saving direction on HAL-16892, phase 1, the board's yes on HAL-16897)

The Claude Code harness shall keep the estimated starting context of a pinned Claude Code version's first model call (the system prompt, the messages and every tool definition, at 3.5 characters per token) at or under 20,000 tokens, with the tool search setting it picks for Claude's own models. Each pinned version shall have a recording of its first call's sizes and tool names, never its text, for each tool search setting the harness picks. When a recording goes over the target, the check shall fail.

## Examples

- Given the recording of Claude Code 2.1.325 with tool search on (about 13,300 tokens),
  when the check runs,
  then it passes.
- Given a new pinned version whose first call with tool search on comes to 21,000 tokens,
  when its recording is added,
  then the check fails.
- Given a recording without a first call for the setting the harness picks,
  when the check runs,
  then it fails.
