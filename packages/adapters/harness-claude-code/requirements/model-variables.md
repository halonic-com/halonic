# harness-claude-code.model-variables

- Status: active
- Since: unreleased
- Source: HAL-12488 (Liam's change 4 on the plan, HAL-12505)

When the task's model is marked `modelForEveryCall`, because the agent's file named a `models.yaml` alias, the Claude Code harness shall set `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_SMALL_FAST_MODEL` and `CLAUDE_CODE_SUBAGENT_MODEL` to that model, so Claude Code's background and subagent calls ask a compatible provider for the agent's model, not for a Claude model it doesn't have. For a model Claude Code knows itself, such as `sonnet`, or no model, it shall set none of them, so a signed-in agent keeps Claude Code's own smaller models.

## Examples

- Given a task for `glm-5.3`, for every call,
  when the engine opens the sandbox,
  then all five variables are `glm-5.3`.
- Given a task for `sonnet`,
  when the engine opens the sandbox,
  then none of the five variables is set.
