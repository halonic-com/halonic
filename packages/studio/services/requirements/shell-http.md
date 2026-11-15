# services.shell-http

- Status: active
- Since: 0.1.0
- Source: HAL-10352, found on HAL-10350 (the page's content security policy blocks a fetch to a model provider)

When the Studio page runs in the desktop shell, it shall send its model-provider requests through the shell's `http_request` command instead of `fetch`, as an `HttpClient`. The client shall pass the method, the headers and a text body, answer a `Response` with the shell's status, headers and body, refuse a body that is not text, fail when the shell refuses (with the shell's words, never the request's headers), stop waiting when the request's `signal` aborts, and fail a 3xx answer when `redirect` is `"error"`. The shell shall reach provider hosts only (`studio.http-request` in the shell), so this client is no way to fetch anything else.

## Examples

- Given a POST with a JSON body and an `x-api-key` header,
  when the client sends it,
  then `http_request` receives the method, the lower-case header and the body, and the answer's status and body come back as a `Response`.
- Given a body that is a `Uint8Array`,
  when the client sends it,
  then it fails with a `TypeError` and the shell is not called.
- Given the shell refuses with `host_refused`,
  when the client sends,
  then it fails with a `TypeError` carrying the shell's message.
- Given a signal that aborts while the shell works,
  when the client waits,
  then it rejects with the signal's reason.
- Given a 302 answer and `redirect: "error"`,
  when the client sends,
  then it fails; with `redirect: "manual"` it answers the 302.
