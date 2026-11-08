# integration-kit.secret-filter

- Status: active
- Since: 0.1.0
- Source: HAL-994 (I5 design v0.2 on HAL-958, section 3.6; Julian's ruling in HAL-972; attack case A19)

The kit shall replace every secret value of a request with `[secret removed]` in the response it hands back: in the headers, in the final URL and in the body. It shall match the raw value; the exact text it put on the wire (`Bearer <value>`, the header prefix plus the value, the form field); and the URL-encoded, form-encoded and JSON-escaped copies of each. It shall decompress a gzip or deflate body before filtering, find a value split across two pieces of a streamed body without holding the whole body, and filter the response after a redirect too. The filter shall be a plain function the bridge can use on tool results, errors and stderr. Base64, reversed, split or otherwise transformed copies are not matched.

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
- Given an echo compressed with gzip or deflate and marked so,
  when the integration reads the body,
  then it gets the plain body with the value replaced and no `content-encoding`; a body the transport already decompressed is not decompressed again.
- Given a redirect from `api.example.com` to `cdn.example.com`, which echoes the key it got from the first server,
  when the integration reads the final response,
  then the value is replaced.
- Given a tool result, an error message or stderr in pieces,
  when the bridge runs them through `removeSecrets` or `removeSecretsStream`,
  then every form is replaced.
