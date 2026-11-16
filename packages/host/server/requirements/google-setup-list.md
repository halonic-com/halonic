# server.google-setup-list

- Status: active
- Since: 0.1.0
- Source: HAL-10697 (served Studio: Google setup read and sign-in place); rule from Liam on HAL-10597

The server shall answer `GET /api/google/setups` with every setup whose account a connector still uses, each as `GET /api/google/setups/<accountRef>` shows it ([server.google-setup](google-setup.md)), and `signIn`: `here` or `elsewhere`, worked out from this request alone. It answers `here` only when **both** the socket's address (as the host vouches for it, never from a header) is loopback (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`) **and** the `Origin` header, or the `Host` header when there is no `Origin`, names a loopback host (`localhost`, `127.0.0.1`, `[::1]`). Every other request, including one with no address, `Origin: null` or a name that only ends in `localhost`, answers `elsewhere`. The list is behind the sign-in, like the rest of the Google routes.

A host that passes `googleRead` ports and no `google` ports shall answer only these two `GET` routes: every other path under `/api/google/`, every other method and Google's redirect answer 404 `not_found`. When `google` is given, `googleRead` is ignored.

Rationale: a served window on another computer can't run Google's sign-in, which comes back to the computer that runs Halonic. It must show the `halonic google sign-in <ref>` command instead. The socket address alone isn't enough: a tunnel or reverse proxy reaches the server from loopback, and the public name it forwards falls to `elsewhere`, the safe side.

## Examples

- Given a request from `127.0.0.1` with `Origin: http://localhost:4747`, then `signIn` is `here`.
- Given a request from `127.0.0.1` with `Host: studio.example.net` (a tunnel), then `signIn` is `elsewhere`.
- Given a request from `192.168.1.20` with `Host: localhost`, then `signIn` is `elsewhere`.
- Given a host with only `googleRead`, then `POST /api/google/setups` answers 404 `not_found`.
