# runtime.https-only

- Status: active
- Since: unreleased
- Source: HAL-16340

The Worker's `fetch()` shall serve nothing over plain HTTP to a name other than `localhost`, `127.0.0.1` or `[::1]`. A `GET` or `HEAD` shall get 308 to the same address over HTTPS. Every other method shall get 403 `https_required`, without its body being read. This shall come before every route: `/health`, `/self-test`, the admin routes and the API.

So a sign-in password, a session cookie and an admin key only cross the internet over HTTPS, and every session cookie the Worker sets carries `Secure`.

Rationale: a deployed Worker is reached across the internet, never only on a local network, and Cloudflare hands it plain-HTTP requests when the zone doesn't force HTTPS. A request that isn't `GET` or `HEAD` isn't redirected, because a browser would send its body again after the body had already crossed in clear. `wrangler dev` serves on a loopback name, which never leaves the developer's computer.

## Examples

- Given `GET http://halonic.example.com/api/hello?x=1`, then the answer is 308 with `Location: https://halonic.example.com/api/hello?x=1`.
- Given `POST http://halonic.example.com/api/login` with the right password, then the answer is 403 `https_required`, it carries no `Set-Cookie`, and the password is never checked.
- Given the same sign-in over HTTPS, then the session cookie carries `Secure`.
- Given `POST http://localhost:8787/api/login` with the right password, then the answer is 200 with a session cookie.
