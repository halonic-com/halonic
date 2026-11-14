# cli.loopback-callback

- Status: active
- Since: 0.1.0
- Source: HAL-717 (D1); Google setup flow design 3.5

The sign-in's local server shall listen on `127.0.0.1` only, on a port the system picks. It shall answer `GET` on `/google/callback` only, and any other path or method with 404. A request on the callback path without `state` and without `error` shall be answered with 400 and ignored. The first request with either shall be kept as the answer, and the server shall show the person a page that holds nothing from the request. Waiting for the answer shall end when the signal ends. The server shall never print or log a query.

## Examples

- Given `/other`, then 404; given `/google/callback` with no query, then 400 and no answer.
- Given `/google/callback?state=s1&code=c1`, then 200 and the answer has `state` `s1`.
- Given the signal ends first, then there is no answer.
