# server.studio-page

- Status: active
- Since: 0.1.0
- Source: HAL-9489, decided on HAL-9482; the served Studio and the phone's workspace picker on HAL-1291

When the host gives the server the built Studio page, the server shall serve its files to `GET` and `HEAD` requests, without a sign-in: `/` answers the page's entry, `studio.html`, and any other path answers the file of that name in the build. The page shows its own sign-in before a session exists, and its files are the same for everyone and hold nothing of the workspace. The page's routes sit behind the same `Host` and `Origin` checks, the same daily request ceiling and the same response headers as every other route. Every `/api` path keeps its own answer, whatever file the build holds, and a request to `/api/…` that no route knows answers 404 as it did before.

The server shall serve a path only when every part of it is a plain name of letters, digits, dot, dash or underscore that doesn't start with a dot, and its extension is one of `html`, `js`, `css`, `svg`, `png`, `ico` or `woff2`. A path with a percent sign, a backslash, an empty part, `.` or `..` answers 404, so no spelling of a path leaves the build's folder. (A URL parser has already resolved `..` before the server sees a path; this check is a second wall.) The server shall name the `Content-Type` from the extension, never from the host. A file the build doesn't have, and every refused path, answers 404 with the code `not_found`. A request with any other method to a page path is answered as an unknown address, 404.

A page file shall carry its own `Content-Security-Policy` in place of the default `default-src 'none'; frame-ancestors 'none'`, and every other response header of `server.response-headers` stays as it is, `Cache-Control: no-store` included. The policy is `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`: the page runs only its own scripts, takes no inline script or style, calls only this server and can't be framed. A host that gives no page leaves every page path at 404.

Rationale: `halonic serve` answered the API but left a browser or the Android app nothing to open. The policy fits the page as Vite builds it: module scripts and a style sheet from its own folder, no inline code, and no other site.

## Examples

- Given a build with `studio.html` and `assets/studio-1a2b.js`, when a browser asks `GET /` on a loopback name, then it gets 200, the entry as `text/html`, and the page's content security policy.
- Given the same build, when it asks `GET /assets/studio-1a2b.js`, then it gets 200 as `text/javascript` and the same policy.
- Given a password is set and no session, then `GET /` still answers 200, and `GET /api/session` answers 401.
- Given `GET /assets//a.js`, `GET /assets%5Ca.js`, `GET /assets%2Fa.js` or `GET /.hidden.js`, then each answers 404 and the host is never asked for a file.
- Given a file of the build named `notes.txt`, then `GET /notes.txt` answers 404.
- Given a foreign `Host` on a server with no password, then `GET /` is refused with 421.
- Given `HEAD /`, then it answers the same headers as `GET /` and no body.
- Given a host that gave no page, then `GET /` answers 404 with the default policy.
