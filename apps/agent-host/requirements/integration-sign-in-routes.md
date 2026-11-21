# agent-host.integration-sign-in-routes

- Status: active
- Since: unreleased
- Source: HAL-12191 (HAL-8613, app side); the prefix route follows the Google callback of HAL-9409; over frames HAL-13427

The agent host shall give Studio the start, status, cancel and sign-out of an integration's sign-ins over its loopback routes, and shall serve the provider's callback itself. A start shall answer the authorize URL, whose redirect names the host's own port, or the relay's when the host serves over frames, and a new random path under `/sign-in/` of 43 base64url characters, and Studio opens that URL; the host shall never put a code, a token or a client secret in an answer. The callback route shall be served without the launch token, as a prefix route, because a browser that follows a redirect can't send the token and the path is new for each sign-in: the sign-in's own `state` is the proof, the `Host` and `Origin` checks still apply, and a path nobody waits on shall get a plain 400 page. An integration the host runs no sign-ins for, a sign-in the sheet doesn't have, a setting that is missing or wrong, and a missing client secret shall each get their own refusal, and any other failure shall answer a fixed message with only the error's name in the log. Over frames the callback's `Host` shall name the relay's port, as the Google callback's does, and Studio's relay passes the callback on without the token only in exactly that path's shape (`studio.src-tauri.crates.agent-host.relay-callback`). A sign-out of all of an integration's sign-ins shall sign out every one that has a saved grant, also for a plugin the trust no longer covers, and answer what became of each; for a name the host runs no sign-ins for it shall answer an empty list. A request refused because the plugin isn't trusted shall also drop the host's parts for it.

## Examples

- Given an integration with a sign-in, when Studio starts it, then the answer is `{ authorizeUrl }` with a redirect to `http://127.0.0.1:<the host's port>/sign-in/<random>` and nothing else.
- Given the browser follows that redirect with the provider's code and no launch token, then the page says the sign-in finished, the status says `signedIn`, and a request through the integration places the sign-in's token.
- Given the user refused at the provider, then the page says it didn't finish and the status carries the outcome `cancelled`.
- Given a callback at a path that isn't pending, then the answer is a 400 page and nothing is exchanged; given one with a wrong `state`, then nothing is exchanged either.
- Given a callback with an `Origin` header or another host name, then it is refused as for every route.
- Given a started sign-in that Studio cancels, then its callback gets the 400 page.
- Given a sign-in that is signed in, when Studio signs it out, then the provider is asked to revoke, the status says `signedOut`, and the answer carries what the provider did.
- Given a plugin with a saved grant whose trust was removed, when Studio signs out all of its sign-ins, then the answer names that sign-in as signed out, no grant of the plugin is left, and its status says `signedOut` once it is trusted again.
- Given a name the host runs no sign-ins for, when Studio signs out all of its sign-ins, then the answer is an empty list.
- Given an integration the host doesn't run sign-ins for, or a plugin that isn't in the profile or that the trust doesn't cover now, then every route answers 404 `unknown_integration`; given a sign-in the sheet doesn't have, a start answers 404 `unknown_sign_in`.
- Given a setting the sign-in reads that is missing, then a start answers 422 `settings_invalid`; given a client secret that isn't set, 422 `client_secret_missing`.
- Given a pick of a secret that belongs to Halonic, then a start answers 502 `sign_in_failed` with a fixed message, and the log holds only an error name.
- Given the host serves over frames, when Studio starts a sign-in, then the redirect names `http://127.0.0.1:<the relay's port>/sign-in/<random>`, and the browser that follows it through the relay without the launch token finishes the sign-in.
- Given the request's socket names no port, then a start answers 501 `callback_unavailable` and starts nothing.
- Given a body with another field, or a name that isn't a sheet name, then it is refused before anything runs.
