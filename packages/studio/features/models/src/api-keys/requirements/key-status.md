# models.api-keys.key-status

- Status: draft
- Since: 0.1.0
- Source: HAL-10 migration checklist U31 (Now, decided; new) (req-models, HAL-110; flow-models, HAL-177)

The provider page shall show whether a key is stored for the provider's secret name, without ever showing the key itself.

## Examples

- Given a key is stored under `anthropic`,
  when the user opens the page of "Anthropic",
  then it says "Key set" and the key field is empty with no way to reveal it.
- Given no key is stored under `openai` and provider "OpenAI" is used by alias `openai`, then its page says "No key" and points at the "API key" field.
