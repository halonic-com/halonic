# services.shell-http-client

- Status: draft
- Since: 0.1.0
- Source: HAL-10348, HAL-10372

While the Studio runs in the desktop shell, a `ShellHttpClient` shall make its outbound HTTP calls through the shell's `http_fetch` command, so the shell's address checks apply and a key never goes through the webview's network layer. It shall be an `HttpClient`: a call that gets an answer resolves with a `Response` for any status; `redirect: "error"` throws on a redirect, `"manual"` returns it and the default follows it in the shell; a signal that is aborted, before or during the call, rejects and tells the shell to stop the call; a refusal from the shell throws an error that names its kind and never holds the address or a header. Each call has its own id on the page. A body that isn't a string is refused before any call. Outside the shell there is no client.

## Examples

- Given a page in the shell,
  when an adapter calls `fetch` with a POST and a JSON body,
  then the shell gets `http_fetch` with the method, address, headers and body, and the adapter gets the answer's status and body.
- Given the call has `redirect: "error"`,
  when the server answers 302 with a `Location`,
  then the call throws.
- Given a call in flight,
  when its signal aborts,
  then the shell gets `http_fetch_abort` with the call's id and the call rejects.
- Given the shell refuses the address,
  when the adapter calls `fetch`,
  then it gets an error with kind `address_refused`.
