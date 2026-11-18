# harness-bridge.injected-fetch

- Status: active
- Since: unreleased
- Source: HAL-6640 (proxy design, section 2.1 and condition C5)

The Node bridge shall call providers and tools only through the `fetch` it is given and shall never reach for Node's own, so that the host decides which hosts the bridge may reach and how. The provider's host class shall be `public` for Anthropic's and OpenAI's own origins and undefined for every other host. The bridge shall not copy a provider's `content-encoding` or `content-length` back to the program, because the client that made the call may have decoded the body.

## Examples

- Given the bridge's source files,
  when they are read,
  then none names `globalThis.fetch`.
- Given the URL `https://api.anthropic.com/v1/messages`,
  when its host class is asked,
  then it is `public`; for `http://api.anthropic.com/`, `https://api.anthropic.com:8443/` and `https://example.com/` it is undefined.
- Given a provider reply that says `content-encoding: gzip` and a `content-length` for the encoded bytes,
  when the bridge passes it back,
  then the program gets the body and neither header.
