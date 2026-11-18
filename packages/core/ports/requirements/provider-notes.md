# ports.provider-notes

- Status: active
- Since: unreleased
- Source: HAL-12285, point 2, for the sampling settings model-anthropic leaves out; task HAL-12287. An added optional field keeps `llmProviderVersion` at 1

The `LlmProvider` port shall let a provider give, in an optional `notes` on its `ChatResponse`, plain sentences on how it changed the call, such as a setting it left out because the model doesn't take it. The notes shall be the provider's own words, never the vendor's text and never a key. A response without `notes` shall still satisfy the port, and a `done` stream event shall carry them in its response as `chat()` would.

## Examples

- Given a `ChatResponse` without `notes`,
  when it is compiled,
  then it compiles.
- Given a `ChatResponse` with `notes: ["Left out temperature: claude-sonnet-5-5 doesn't take it."]`,
  when it is compiled,
  then it compiles.
- Given a `ChatResponse` with `notes: "Left out temperature."`,
  when it is compiled,
  then it doesn't compile.
