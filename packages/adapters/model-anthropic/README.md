# @halonicjs/adapter-model-anthropic

The model provider for Anthropic's Messages API: one call goes to `POST {baseUrl}/v1/messages` with native tools, on the built-in `fetch` and without Anthropic's SDK.

- **Layer:** adapters
- **Owner:** tomas
- **Runtime:** any
- **Public API:** `@halonicjs/adapter-model-anthropic`

The package is being built in small pull requests (HAL-2921). This first part turns a chat request into a Messages API body and reads a Messages API reply back into a chat response. The provider itself, streaming and the factory follow.
