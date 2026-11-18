# cli.loopback-callback

- Status: active
- Since: unreleased
- Source: HAL-717 (D1); Google setup flow design 3.5

The sign-in's local server shall listen on `127.0.0.1` only, on a port the system picks. It shall answer `GET` on `/google/callback` only, and any other path or method with 404. A request on the callback path without `state` shall be answered with 400 and ignored. Waiting shall go on until a request arrives whose `state` is the pending sign-in's, so a request with another `state` cannot end the sign-in. A request with another `state`, or one that arrives when nothing waits, shall be answered with a neutral page that does not say the sign-in worked, and shall not be kept. The request with the pending sign-in's `state` shall be kept as the answer, and the server shall show the person a page that holds nothing from the request, sent with `cache-control: no-store` and `referrer-policy: no-referrer`. Waiting for the answer shall end when the signal ends. The server shall never print or log a query.

## Examples

- Given `/other`, then 404; given `/google/callback` with no query, then 400 and no answer.
- Given `/google/callback?state=other&code=x` while waiting for `s1`, then 200 with the neutral page (not "you can close this tab"), the request is not kept and the wait goes on.
- Given `/google/callback?state=s1&code=c1` before any wait, then 200 with the neutral page, and a wait started afterwards does not get it.
- Given `/google/callback?state=s1&code=c1`, then 200 and the answer has `state` `s1`.
- Given the signal ends first, then there is no answer.
