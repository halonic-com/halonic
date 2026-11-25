# cli.commands.serve.messaging-mount

- Status: active
- Since: unreleased
- Source: HAL-18809 (S4b, item 3 of HAL-18769); `server.messaging-routes`, `server.messaging-needs-session`, `server.paperclip-key-store`, `server.paperclip-sign-in`

The `halonic serve` command shall give the server its agent messaging over the Paperclip keys stored in the serve profile, so the `/api/messaging/*` routes are mounted, behind a signed-in session as `server.messaging-needs-session` says. `serve` serves one owner, so it shall mount them; a many-user server never does (`server.messaging-needs-session`).

When a sign-in poll stores a key (`connected`), the server shall make its messaging again from the stored keys before it answers, so the routes list that connection's source and call it with the new key without a restart. When Disconnect removes a key, the server shall make its messaging again before it answers, so the source is gone from the routes at once and no later call carries the removed key. A `GET /api/messaging/changes` reader open across either shall keep reading, and shall hear the changed connection's source. When making the messaging again fails, the key change shall stand, the failure shall go to `--debug`, and the routes shall keep the messaging from before until the next sign-in or Disconnect.

Rationale: the server mounts its routes once, when it starts, and a Paperclip key reaches `serve` only through a sign-in while it runs. Without making the messaging again, a new connection would need a restart, and a disconnected one would stay listed until then.

## Examples

- Given a stored key for the connection `halonic`, when a signed-in session asks `GET /api/messaging/sources`, then the answer lists `paperclip:halonic`.
- Given a second connection file `studio` with no key, when the board approves its sign-in through `/api/paperclip-keys/sign-in/poll`, then `GET /api/messaging/sources` lists `paperclip:halonic` and `paperclip:studio`, and `GET /api/messaging/agents` calls Paperclip with the new key.
- Given that, when `POST /api/paperclip-keys/disconnect` removes `studio`, then the sources list only `paperclip:halonic`, and no later call carries `studio`'s key.
- Given a request with no session, then `GET /api/messaging/sources` answers 401.
