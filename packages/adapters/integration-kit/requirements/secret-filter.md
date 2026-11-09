# integration-kit.secret-filter

- Status: active
- Since: 0.1.0
- Source: HAL-994 (I5 design v0.2 on HAL-958, section 3.6; Julian's ruling in HAL-972; attack case A19)

The kit shall replace every secret value of a request with `[secret removed]` in the response it hands back: in the status text, in the headers, in the final URL and in the body, and in the message, stack and cause of every error the request ends with. It shall match the raw value; the exact text it put on the wire (`Bearer <value>`, the header prefix plus the value, the form field); and the URL-encoded, form-encoded and JSON-escaped copies of each. It shall filter the body as the transport hands it over, leaving its bytes and `content-encoding` otherwise as they came, find a value split across two pieces of a streamed body without holding the whole body, and filter the response after a redirect too. The filter shall be a plain function the bridge can use on tool results, errors and stderr. Base64, reversed, split or otherwise transformed copies are not matched.

## Examples

- Given a server that echoes the request's `authorization` header and body,
  when the integration placed `example-key` as a bearer token or a form field,
  then the response holds `[secret removed]` where the value or its placed form was.
- Given a secret with characters that URL-encoding and JSON escape change,
  when the server echoes it URL-encoded (upper or lower case), form-encoded or JSON-escaped (with `/` as `\/` too),
  then each copy is replaced.
- Given an echo split across two pieces of a streamed body, at any byte,
  when the integration reads the body,
  then the value is replaced, and no piece holds more than the last `longest form − 1` bytes back.
- Given a server that puts the placed form in the status text,
  when the integration reads `statusText`,
  then it holds `[secret removed]`.
- Given a redirect to a URL that holds the value, followed by a refusal (`host-not-allowed`, `too-many-redirects`, `response-too-large`) or a timeout (headers or idle),
  when the integration reads the error's message and stack,
  then neither holds the value.
- Given a gzip file, or plain text that starts like a zlib header, served with `content-encoding`,
  when the integration reads the body,
  then it gets the bytes as the transport handed them over, with `content-encoding` kept.
- Given a redirect from `api.example.com` to `cdn.example.com`, which echoes the key it got from the first server,
  when the integration reads the final response,
  then the value is replaced.
- Given a tool result, an error message or stderr in pieces,
  when the bridge runs them through `removeSecrets` or `removeSecretsStream`,
  then every form is replaced.
