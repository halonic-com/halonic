# agent-host.paperclip-key-hand-over

- Status: active
- Since: unreleased
- Source: HAL-17495; ADR `docs/adr/2026-11-24-agent-messaging.md` (the key, Julian's findings 1 and 6 on HAL-17436); drafts `ports.paperclip-key` and `ports.paperclip-connection`, made active here for the key's hand-over, its address and company check and Connect being the only way a key reaches the host

When Studio hands the agent host a Paperclip connection's key with `POST /v1/paperclip/key`, with the connection's name, the key and the address and company the key was made for, the agent host shall keep them in memory only, replacing what it held for that connection, shall answer `{ kept: true }`, and shall make no request to Paperclip. Before every request to Paperclip, the agent host shall compare the address's scheme, host and port and the company with the connection file as it is then, and shall send the request with the key only when both match. If they differ, or it holds no key for the connection, then it shall make no request and report the source `signed-out`. Opening a workspace that holds a connection file shall give the agent host no key and make no request. If the request's `Sec-Fetch-Site` isn't `same-origin`, then the agent host shall answer 403 `secret_from_other_site` before it reads the body. If the body doesn't fit (a connection name that isn't letters, digits, `_` or `-`, a key that isn't printable ASCII, an address that isn't `http` or `https`), then it shall answer 400 `body_invalid` with no detail. No answer, error, log line or file shall hold the key.

## Examples

- Given a key handed over for `halonic`, made for `https://paperclip.acme.test` and company `acme-company`,
  when the connection file's address changes to `https://evil.test`,
  then the next request isn't sent and the source reports `signed-out`.
- Given the same key,
  when the connection file's company changes to `other-company`,
  then the next request isn't sent and the source reports `signed-out`.
- Given the same key,
  when the connection file says `https://PAPERCLIP.acme.test:443/`,
  then the request is sent with the key to `https://paperclip.acme.test`.
- Given a workspace with `connections/paperclip/halonic.yaml`,
  when it is opened and nobody connects,
  then no request goes to the file's address.
- Given a hand-over,
  when it succeeds or is refused,
  then neither the answer nor the host's log holds the key.
- Given a hand-over from a page of another site,
  when the host reads the request,
  then the answer is 403 `secret_from_other_site` and no key is kept.
