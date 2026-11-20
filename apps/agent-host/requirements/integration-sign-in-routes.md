# agent-host.integration-sign-in-routes

- Status: active
- Since: unreleased
- Source: HAL-12191 (HAL-8613, app side); the prefix route follows the Google callback of HAL-9409

The agent host shall give Studio the start, status, cancel and sign-out of an integration's sign-ins over its loopback routes, and shall serve the provider's callback itself. A start shall answer the authorize URL, whose redirect names the host's own port and a new random path under `/sign-in/`, and Studio opens that URL; the host shall never put a code, a token or a client secret in an answer. The callback route shall be served without the launch token, as a prefix route, because a browser that follows a redirect can't send the token and the path is new for each sign-in: the sign-in's own `state` is the proof, the `Host` and `Origin` checks still apply, and a path nobody waits on shall get a plain 400 page. An integration the host runs no sign-ins for, a sign-in the sheet doesn't have, a setting that is missing or wrong, and a missing client secret shall each get their own refusal, and any other failure shall answer a fixed message with only the error's name in the log. When the host serves over frames, a start shall be refused, because the relay passes only one fixed callback path without the token.

## Examples

- Given an integration with a sign-in, when Studio starts it, then the answer is `{ authorizeUrl }` with a redirect to `http://127.0.0.1:<the host's port>/sign-in/<random>` and nothing else.
- Given the browser follows that redirect with the provider's code and no launch token, then the page says the sign-in finished, the status says `signedIn`, and a request through the integration places the sign-in's token.
- Given the user refused at the provider, then the page says it didn't finish and the status carries the outcome `cancelled`.
- Given a callback at a path that isn't pending, then the answer is a 400 page and nothing is exchanged; given one with a wrong `state`, then nothing is exchanged either.
- Given a callback with an `Origin` header or another host name, then it is refused as for every route.
- Given a started sign-in that Studio cancels, then its callback gets the 400 page.
- Given a sign-in that is signed in, when Studio signs it out, then the provider is asked to revoke, the status says `signedOut`, and the answer carries what the provider did.
- Given an integration the host doesn't run sign-ins for, then every route answers 404 `unknown_integration`; given a sign-in the sheet doesn't have, a start answers 404 `unknown_sign_in`.
- Given a setting the sign-in reads that is missing, then a start answers 422 `settings_invalid`; given a client secret that isn't set, 422 `client_secret_missing`.
- Given a pick of a secret that belongs to Halonic, then a start answers 502 `sign_in_failed` with a fixed message, and the log holds only an error name.
- Given the host serves over frames, then a start answers 501 `callback_unavailable`.
- Given a body with another field, or a name that isn't a sheet name, then it is refused before anything runs.
