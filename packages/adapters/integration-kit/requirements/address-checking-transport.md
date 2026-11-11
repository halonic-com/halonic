# integration-kit.address-checking-transport

- Status: active
- Since: 0.1.0
- Source: HAL-5232 (follow-up from the code review on HAL-5216), I5 design HAL-958 section 3.8 (the transport checks the addresses a name resolves to)

The kit's loader shall take as its transport only an `AddressCheckingHttpClient`, an `HttpClient` that checks the addresses a host name resolves to on every request and redirect hop, because the kit checks hosts by name only. The Node transport from `createNodeHttpClient` shall be one.

## Examples

- Given a plain `fetch` wrapper as the transport,
  when `loadIntegration` or `prepareIntegration` is called with it,
  then the code doesn't compile.
- Given the transport from `createNodeHttpClient`,
  when it is passed to `loadIntegration`,
  then it compiles.
