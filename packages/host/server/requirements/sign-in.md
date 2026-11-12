# server.sign-in

- Status: active
- Since: 0.1.0
- Source: HAL-9 plan phase 4; HAL-6 finding 6; build plan on HAL-195 (PR 3)

The server shall answer `POST /api/login` with a JSON body `{ "password": "…" }` by checking the password against the hash in the `serve-password` secret with the `PasswordHasher` port. A right password shall start a session and answer 200 with `{ "signedIn": true }` and a `Set-Cookie`. A wrong password shall answer 401 with the code `wrong_password`. A body that isn't JSON of that form, a `Content-Type` other than `application/json`, an empty password, or one over 1024 characters shall answer 400 with the code `bad_request` without a password check. A server with no password configured shall answer 404, because there is nothing to sign in to. `POST /api/logout` shall end the session its cookie names and answer 204 with a cookie that clears it.

Rationale: the password is the only thing between the network and the workspace on a server that listens beyond this computer, so a failed check must say nothing more than "wrong", and a malformed request must not cost a password check.

## Examples

- Given a server with a password, when `POST /api/login` carries the right password, then the answer is 200 and a session cookie.
- Given the same server, when the password is wrong, then the answer is 401 `wrong_password` and no cookie is set.
- Given the same server, when the body is `{"password": 5}`, then the answer is 400 and the hasher is not called.
- Given a server with no password, then `POST /api/login` answers 404.
