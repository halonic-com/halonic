# settings.ai-agent-provider-defaults

- Status: active
- Since: 0.1.0
- Source: HAL-8123 (T11 PR 8); req-settings `settings.ai-agent.provider-defaults` (U28); flow-settings 7 (HAL-646), G5 decision 3

The Settings feature shall offer the providers Not set up, Anthropic, OpenAI, Gemini, Ollama (local), LM Studio (local) and OpenAI-compatible, in that order. Picking a provider shall fill in its secret name, Base URL and Local switch, except for a field the person changed from the previous provider's default, which shall keep their value. The cloud providers shall have an empty Base URL, meaning the provider's own; Ollama and LM Studio shall have their usual local address filled in, with Local on and no secret name.

## Examples

- Given the provider is Anthropic with its defaults,
  when the person picks OpenAI,
  then the secret name becomes `openai-api-key`.
- Given the provider is Anthropic and the person changed the secret name to `work-key`,
  when they pick OpenAI,
  then the secret name stays `work-key`.
- Given the provider is Anthropic,
  when the person picks Ollama (local),
  then the Base URL is `http://localhost:11434/v1`, Local is on and the secret name is empty.
