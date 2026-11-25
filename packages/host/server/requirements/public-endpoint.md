# server.public-endpoint

- Status: draft
- Since: unreleased
- Source: HAL-17512 `server-engine` rev 2, §4 (PR S7); Julian's security note on HAL-17513, findings S3 and S10

When `serve` is started with `--public-origin https://<host>`, it shall refuse to start, for the whole server, unless a `serve-password` is set, and shall refuse to start together with `--network`, each time exiting with a message that names the reason. It shall listen on `127.0.0.1` only. It shall accept only `<host>` in the `Host` header and refuse every other name, loopback names included, with 421 `host_not_allowed` (`server.host-check`). It shall treat every request as `secure` from this setting and never read an `X-Forwarded-*` header. Its answers shall carry `Strict-Transport-Security`, and its session cookie shall be the `__Host-` cookie of `server.session`; the `Origin` check (`server.origin-check`) is unchanged. A `--public-origin` that isn't an `https` origin with no path shall be refused at start.

Rationale: behind a proxy on the same machine, every outside request comes from loopback, so the loopback rules that keep a local server safe would open it to the internet.

## Examples

- Given `--public-origin https://engine.example.com` and no password, then `serve` exits with the message.
- Given the same option with a password, when a request sends `Host: localhost`, `Host: 127.0.0.1` or `Host: other.example.com`, then it answers 421.
- Given a plain request with `X-Forwarded-Proto: http`, then the answer still sets the `__Host-` cookie and HSTS.
- Given `--network --public-origin https://engine.example.com`, then `serve` exits with the message.
