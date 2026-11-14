# server.google-sign-in

- Status: active
- Since: 0.1.0
- Source: HAL-710 (build plan B5, D6); google setup flow 3.5 (step 7) and the routes doc, section 5.1

The server shall, behind the sign-in and the same-site check, answer `POST /api/google/setups/<accountRef>/sign-in` by starting a sign-in for the account and answering `{ authUrl }`, the address to open in the browser, and by saving on the record that a sign-in started. It shall send Google back to this server's own port, at `GET /api/google/callback`. It shall refuse with 409 `sign_in_needs_this_computer` a request that is not addressed to a loopback name, and with 409 `google_setup_incomplete` a setup without a client ID and secret. The callback shall not need a session, because the browser Google sends back may hold none: the sign-in's own `state` is the proof, and the sign-in package refuses a `state` it didn't make. The callback shall finish the sign-in, save on the record how it ended (the sign-in and each service's result, or that the sign-in is over), tell the open setup item through the `signInEvents` port, and answer a page of fixed text for the outcome. The page, the request log and every thrown error shall hold no authorisation code, no `state`, no token and no secret, and the request log shall record the callback by path without its query string.

Rationale: the callback is the one request that carries Google's authorisation code, and it comes from a browser that may not be signed in, so nothing in it may be echoed, logged or kept beyond the exchange.

## Examples

- Given a setup with a client ID and a saved secret on a loopback name, then a start answers an `authUrl` and the record has `signInStartedAt`.
- Given a callback that signs in, then the record has `lastSignInAt` and the service results, the item gets a `signedIn` event, and the page names no code or state.
- Given a callback Google sent with `error=access_denied`, then the page says nothing was saved and the record's sign-in is dropped.
- Given a request to start over a LAN name, then the answer is 409 `sign_in_needs_this_computer` and no sign-in is made.
