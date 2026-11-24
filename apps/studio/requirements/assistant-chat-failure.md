# studio.assistant-chat-failure

- Status: active
- Since: unreleased
- Source: HAL-17479 (T14 PR 7c); states H22 (HAL-5896); microcopy 14.1 "Model unreachable" and 22 F7, F8 (HAL-751)

When a Build chat's model call fails for a reason a run names, such as a model it couldn't reach or one that didn't fit in memory, the app shall give the Assistant feature the failure's facts as a failed run gives them (`chatFailureOf`), with the model the chat called: its alias's provider and address from the workspace's files, or the Settings › Assistant model, named by its provider type. An agent chat's failure, and a failure with no such reason, shall give no model, so the chat keeps its own words.

## Examples

- Given the alias `fast` points at the workspace's Ollama and the call couldn't reach it,
  then the facts are `model-unreachable` at Ollama, `localhost:11434`, alias `fast`, local.
- Given the chat is on the Settings › Assistant model `anthropic`/`claude-x` and `api.anthropic.com` didn't answer,
  then the facts name the provider `anthropic` at `api.anthropic.com`, alias `anthropic/claude-x`, not local.
