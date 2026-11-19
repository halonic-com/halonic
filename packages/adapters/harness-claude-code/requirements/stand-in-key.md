# harness-claude-code.stand-in-key

- Status: active
- Since: unreleased
- Source: HAL-12784 (found in the real run: Claude Code 2.1.318 without a key or a sign-in answers "Not logged in" and never calls its model)

When the run's bridge reaches Anthropic with a key Halonic keeps, the Claude Code harness shall set `ANTHROPIC_API_KEY` to a fixed stand-in that holds no secret, so Claude Code calls its model through the bridge, which puts the real key in its place. When the bridge uses the person's own sign-in for Anthropic, it shall leave `ANTHROPIC_API_KEY` unset, so Claude Code sends that sign-in.

## Examples

- Given a bridge whose `keyProviders` names `anthropic`,
  when the harness builds Claude Code's environment,
  then `ANTHROPIC_API_KEY` is the stand-in, never a key's value.
- Given a bridge with no `keyProviders`, or one that names only `openai`,
  when the harness builds Claude Code's environment,
  then it has no `ANTHROPIC_API_KEY`.
