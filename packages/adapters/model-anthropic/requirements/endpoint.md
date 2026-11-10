# model-anthropic.endpoint

- Status: active
- Since: 0.1.0
- Source: HAL-2921; the `HttpClient` port v1 (`redirect: "error"` keeps a key at its address)

The Anthropic provider shall send each call as `POST {baseUrl}/v1/messages`, with Anthropic's own address when no base URL is set and with or without a trailing `/` or `/v1` on it, with the `anthropic-version` header, and shall not follow redirects. It shall send the key only in the `x-api-key` header, never in the body. When the key can't be read, the call shall fail with that error before it reaches the vendor.

## Examples

- Given no base URL,
  when a call is sent,
  then it goes to `https://api.anthropic.com/v1/messages`.
- Given the base URL `https://proxy.example/v1`,
  when a call is sent,
  then it goes to `https://proxy.example/v1/messages`, not `/v1/v1/messages`.
- Given the key's secret isn't set,
  when `chat` is called,
  then it fails with `no-key` and the vendor sees no call.
