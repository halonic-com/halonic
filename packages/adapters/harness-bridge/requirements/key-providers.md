# harness-bridge.key-providers

- Status: active
- Since: unreleased
- Source: HAL-12784 (found in the real run: Claude Code without a key never calls its model)

When the bridge opens for a run, it shall name in `keyProviders` the providers it reaches with a key Halonic keeps, in place of the program's own, so the harness can give a program that won't call its model without a key of its own a stand-in that holds no secret. When every provider uses the program's own sign-in, it shall name none.

## Examples

- Given a run whose Anthropic and OpenAI access are both keys,
  when its bridge opens,
  then `keyProviders` is `anthropic` and `openai`.
- Given a run whose Anthropic access is the program's own sign-in and whose OpenAI access is a key,
  when its bridge opens,
  then `keyProviders` is `openai` alone.
- Given a run that reaches Anthropic only with the program's own sign-in,
  when its bridge opens,
  then it has no `keyProviders`.
