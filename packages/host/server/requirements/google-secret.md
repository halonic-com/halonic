# server.google-secret

- Status: active
- Since: 0.1.0
- Source: HAL-710 (build plan B5, D6); security review HAL-705 (A7); models flow 3.3 (the API key's rules)

The server shall take a Google client secret only on `PUT /api/google/setups/<accountRef>/secret`, with a JSON body `{"clientSecret": "<text>"}`, behind the sign-in. A request shall be refused before anything is saved when it has a `Sec-Fetch-Site` other than `same-origin` (403 `secret_from_other_site`), when its content type isn't `application/json` (415 `json_required`), or when it neither arrives over HTTPS nor is addressed to a loopback name, unless the body also says `"confirmedPlainHttp": true` (403 `secure_connection_required`). A body that isn't a JSON object with a non-empty string `clientSecret` of at most 512 characters shall be refused with 400 `secret_not_accepted`. The first secret of a setup shall be kept in the client secret store and its ref saved on the record. A setup that has never signed in, and whose client no other account uses, shall have its secret replaced in place. Any other setup shall be refused with 409 `secret_needs_staging`, and its secret in use shall not change. Every answer of this route shall be fixed text: it shall not echo any part of the request, of a parse error or of the schema's issues, and a failure inside the route shall reach the error log without the request body. The request log shall leave this route out entirely.

Rationale: the secret is the one value in the setup that a leak turns into someone else's access to the user's Google data, so it travels one way, over a checked channel, and nothing the server says or logs can carry it back. A replaced secret that Google never checked must not overwrite a working one.

## Examples

- Given a setup with no secret, when a same-origin JSON `PUT` carries a fake secret, then it answers `{"saved": true}`, the store holds the secret and the record holds only its ref.
- Given a setup that never signed in and has a secret, then a second `PUT` replaces it in place.
- Given a setup that has signed in, then a `PUT` answers 409 `secret_needs_staging` and the secret in use is unchanged.
- Given a body that is not JSON but contains a fake secret, then the answer, every log line and every error handed to the error log hold no part of it.
- Given a request over plain http to a non-loopback name, then it is refused unless the body confirms plain http.
