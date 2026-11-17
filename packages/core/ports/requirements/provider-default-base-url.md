# ports.provider-default-base-url

- Status: active
- Since: unreleased
- Source: HAL-1292 review (HAL-9946); the cost rules and the adapter presets must agree on the address a provider calls

The ports package shall export `defaultBaseUrl`, which gives the address a provider type calls when it sets no `baseUrl`: `https://api.openai.com/v1` for `openai`, `http://localhost:11434/v1` for `ollama` and `http://localhost:1234/v1` for `lmstudio`. For any other type, including names such as `constructor`, it shall give undefined. The adapters' presets and the workspace cost rules shall read this table.

## Examples

- Given `ollama`, when asked, then the answer is `http://localhost:11434/v1`.
- Given `openai-compatible` or `constructor`, when asked, then the answer is undefined.
