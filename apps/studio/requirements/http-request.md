# studio.http-request

- Status: active
- Since: 0.1.0
- Source: HAL-10352, found on HAL-10350 (the page's content security policy, `default-src 'self'`, blocks a fetch to a model provider)

On desktop, the shell shall give the app's own page an `http_request` command (capability `desktop-http`, local and the main window only) that sends one request to a model provider and answers its status, headers and body as text. It shall reach only a provider host over HTTPS on port 443 (`api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`, `openrouter.ai`), or `localhost` and `127.0.0.1` over HTTP on the local model servers' ports (11434, 1234). It shall resolve the name once, refuse unless every address is of the host's class (public for a provider, loopback for a local server), connect only to an address it checked, use no proxy and follow no redirect. It shall allow `GET` and `POST`, refuse the headers `host`, `cookie`, `content-length`, `connection`, `transfer-encoding`, `upgrade` and `proxy-authorization`, an address with a login, a request body over 8 MiB, and an answer over 32 MiB. A refusal shall carry a stable `kind` and never a header value. The served Studio shall get no `http_request`.

## Examples

- Given `https://api.anthropic.com/v1/messages`,
  when the page sends it,
  then the shell sends it and answers the provider's response.
- Given `https://example.com/` or `https://api.anthropic.com.evil.example/`,
  when the page sends it,
  then it is refused as `host_refused` and nothing leaves the computer.
- Given a provider name that resolves to `10.0.0.1`, `127.0.0.1` or `169.254.169.254`,
  when the page sends it,
  then it is refused as `address_refused`.
- Given a provider that answers 302,
  when the page sends it,
  then the 302 comes back as it is and is not followed.
- Given a page the shell serves to another computer,
  when it calls `http_request`,
  then the shell refuses the command.
