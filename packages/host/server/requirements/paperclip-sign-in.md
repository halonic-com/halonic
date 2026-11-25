# server.paperclip-sign-in

- Status: active
- Since: unreleased
- Source: HAL-17512 `server-engine` rev 2, §3 "Putting the key there" and §7 (PR S5); A4's sign-in (`agent-host.paperclip-sign-in`); `server.paperclip-key-store`. Built in HAL-18496.

The server shall answer `POST /api/paperclip-keys/sign-in/start`, `/sign-in/poll`, `/sign-in/cancel` and `POST /api/paperclip-keys/disconnect` only to a request with a live device or password session, and 401 `not_signed_in` to any other, loopback and a server with no password included, as `server.messaging-needs-session` does; a many-user server shall not mount them and shall answer 404 `not_found`.

When a sign-in starts for an address, the server shall start Paperclip's CLI sign-in at the address of the engine workspace's connection file with that address (or of the named one, when it has that address), keep the board key Paperclip hands back in memory only, and answer the sign-in's ID, its phrase, its end time ten minutes on and the approval page on the connection file's own address, never on an address Paperclip names. When no connection file has that address, the server shall refuse with `address-not-allowed` and shall write no file into the workspace.

When a poll sees the board's approval, the server shall read `/api/cli-auth/me` with the key and, when its user belongs to the connection file's company, store the record `{ key, address, company }` under the connection's token name (`server.paperclip-key-store`), revoke the key it replaced, and answer `connected` with the connection's name, address and company. When the user doesn't belong to that company, the server shall revoke the key, store nothing and answer `wrong-company`, with `keyMayWork` when the revoke fails. When storing fails, it shall revoke the key.

When a sign-in is cancelled or reaches its end time, polled or not, the server shall drop the key from memory and cancel the challenge; when Paperclip says the board approved it first, or can't say how it ended, the server shall revoke the key, and when that revoke fails it shall answer `keyMayWork`.

When Disconnect is asked for a connection with a stored key, the server shall send `revoke-current` with that key to the address it was made for, then delete the record and the connection's messaging cache, also when the revoke failed, and answer whether Paperclip revoked it, so Studio can say that the key stays valid until it expires.

No answer and no log entry shall hold a key. A failure shall answer 502 `paperclip_sign_in_failed`, and the error log shall get only the route and the error's name.

Rationale: the board key reaches the server only through a sign-in the owner started from a paired Studio and the board approved, and no device ever holds it.

## Examples

- Given a server with no password, from `127.0.0.1` with no session, when `POST /api/paperclip-keys/sign-in/start` is sent, then it answers 401 `not_signed_in`.
- Given `connections/paperclip/acme.yaml` for `https://paperclip.acme.test` and company `acme-company`, when the owner starts a sign-in for that address and the board approves it, then the store holds `{ key, address: "https://paperclip.acme.test", company: "acme-company" }` and the poll's answer holds no key.
- Given an approval by a user of another company, then the key is revoked, nothing is stored and the poll answers `wrong-company`.
- Given an open sign-in, when ten minutes pass with no poll, then the key is no longer held and its challenge is cancelled.
- Given a stored key and a Paperclip that refuses `revoke-current`, when Disconnect is asked, then the record and the cache are gone and the answer is `{ outcome: "disconnected", revoked: false }`.
