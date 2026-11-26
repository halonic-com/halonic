# paperclip-client.live-events

- Status: active
- Since: unreleased
- Source: the sync service design on HAL-19201, approved by Liam with conditions (26 Nov 2026); HAL-19125 (new messages 20+ s late); task HAL-19338 (PR 6 of that build), Julian's security gate

The Paperclip provider shall open a company's live events socket only through the one `liveEvents` row of its fixed request list, which is a WebSocket upgrade that `fetch` never sends, with its own WebSocket client and no library. It shall send the key only in the `Authorization` header of the upgrade, never in the address, which carries no query. It shall connect over `wss`, or plain `ws` only to `localhost`, `127.0.0.1` and `::1`, with certificate checks on, shall follow no redirect, and shall accept only a `101` answer with the right accept value and no extension. It shall read at most 1 MB per frame, deciding from the frame's header, and close the connection with 1009 on a larger one before it holds any of it; it shall close on a binary frame, a frame that isn't JSON text and one that breaks the format. It shall send `live.hello` and then `live.interests` with no run IDs, answer a ping with a pong, and tell its owner `open`, each event of its own company (an `activity.logged` cut to its action, entity type and entity ID, any other event to its type), `resync` for `live.resync`, and `closed` once, with the close code and why: `not-allowed` for a 403, `signed-out` for a 401, `redirect`, `offline`, `bad-answer`, `too-large`, `closed` or `stopped`.

## Examples

- Given a connection to Paperclip at a loopback address,
  when the events socket opens,
  then the upgrade request carries the key in `Authorization` only, its path has no query, and the first two frames are `live.hello` and `live.interests` with empty `runIds`.
- Given the address `http://paperclip.acme.example`, or a `ws` address to that host,
  when the events socket would open,
  then it is refused before any connection is made.
- Given an upgrade answered with 302 to another server,
  when the socket opens,
  then the other server gets no request and the connection closes as `redirect`.
- Given an open socket,
  when Paperclip sends a frame that declares 1 MB and 1 byte,
  then the client sends a close with 1009 and the owner hears `closed` with 1009 and `too-large`.
- Given an upgrade answered with 403,
  when the socket opens,
  then the owner hears `closed` as `not-allowed`.
- Given an `activity.logged` for another company,
  when it arrives,
  then the owner hears nothing.
