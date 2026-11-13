# settings.ai-agent-fields

- Status: active
- Since: 0.1.0
- Source: HAL-8123 (T11 PR 8); req-settings `settings.ai-agent.steps-per-answer` (U28); flow-settings 7 (HAL-646); microcopy 14

The Settings feature shall check a typed Assistant field when the person leaves it, and shall save nothing while it shows an error. Model shall not be empty once a provider is set: "Enter a model name, like claude-sonnet-5-5." Base URL shall be empty (the provider's own) or a full http or https address, and shall be required for OpenAI-compatible: "Enter a full address, like http://localhost:8000/v1." Secret name shall be empty or a name a secret can have. Turn limit shall be a whole number from 1 to 64, or empty for the default 16: "Enter a whole number from 1 to 64."

## Examples

- Given the provider is Anthropic,
  when the person leaves Model empty,
  then the error is "Enter a model name, like claude-sonnet-5-5." and nothing is saved.
- Given the provider is OpenAI-compatible,
  when the person leaves Base URL empty,
  then the error is "Enter a full address, like http://localhost:8000/v1."
- Given the person types 0, 65, 2.5 or "many" as the Turn limit,
  when they leave it,
  then the error is "Enter a whole number from 1 to 64."
- Given the person clears the Turn limit,
  when they leave it,
  then the Turn limit is the default 16.
