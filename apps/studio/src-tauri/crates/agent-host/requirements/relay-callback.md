# studio.src-tauri.crates.agent-host.relay-callback

- Status: draft
- Since: unreleased
- Source: HAL-10028 (plan: HAL-10017, Revision 2); security read HAL-10026; the integration sign-in's path HAL-13427

When a connection's first request has no valid token and is a sign-in callback, with or without a `?query` of at most 2 KiB, the relay shall hold the request back until its head is whole, pass the host exactly the bytes up to and including the first blank line, and then stop reading that client, so a browser's redirect back from a sign-in reaches the host without the token and nothing else does. A sign-in callback is one of two paths, and only these:

- `GET /v1/google/callback`, Google's sign-in;
- `GET /sign-in/` and exactly 43 base64url characters (`A-Z`, `a-z`, `0-9`, `-`, `_`), an integration's sign-in, whose path the host makes new for each start (`agent-host.integration-sign-in-routes`).

The relay decides from the first request's head alone, as the client sent it, and nothing is forwarded before it decides. A connection is "callback-only" when its head passes every rule below; whether the head carried the token is a separate fact. A head with the token is passed as any other request, whatever its request line says, and is never callback-only.

The head is refused, and the connection closed and reset at the host with none of the head forwarded, when:

- the request line is not byte for byte a callback's method and path, optionally `?` and a query, then ` HTTP/1.1`; the path is case-sensitive, and the query has at most 2048 bytes, no `#`, no space and no control or non-ASCII byte;
- the head holds a bare CR, a bare LF, a NUL or any other control byte;
- the head has a `Content-Length` (any value), `Transfer-Encoding`, `Upgrade` or `Expect` header, or a `Connection` header that lists `upgrade` (names compared without regard to case, whitespace before the colon ignored);
- a header line starts with a space or tab, or has no colon, or has a name that is not HTTP token characters (`Content Length`);
- the head is longer than 16 KiB.

A head that is not complete never reaches the host: one ending in bare LFs never ends, and the head deadline closes it. A client that ends partway through `GET /v1/google/call…` or `GET /sign-in/abc…` has the bytes it sent forwarded unjudged: never a whole request, so harmless, and the token deadline still applies. A first request that does not start like a callback (another method or path, `/v1/google/callback/`, `/v1/google/callbackx`, `/sign-in/` with a random part that is shorter, longer or has another character, or with a `/` after it) is not touched by this requirement: it is passed on, and `relay-limits.md` closes it without the token. The relay does not look at `Host` or `Origin`; the host refuses those itself.

While it holds a callback-only or a still-judged callback connection, the relay shall allow at most 4 of them at once, close one whose head is not whole 5 seconds after the relay accepted it, and close any of them 30 seconds after it accepted it, and shall reset each it closes at the host. These places are separate from the connections with the token, which they never fill, and each connection still counts toward the 256 the relay and the host allow. A connection past the 4 places is closed when it shows it starts like the callback.

When the host ends a callback-only connection, the relay shall close it at once. It does not detect the end of the answer itself: the callback route answers with `Connection: close`, the host ends the socket, the frame stream carries `end`, and the relay closes without waiting for the host's keep-alive timeout.

The relay shall log nothing of a callback request except the path of its request line, never the query, which holds the provider's code.

## Measured size

A callback from Google for a sign-in with a dozen of Studio's Google scopes, the `state` (43 characters), a code of about 100 characters, `authuser`, `prompt` and `hd` comes to a query of about 0.9 KiB (the whole request line 0.95 KiB). That is below the 1.5 KiB that would call for 4 KiB, so the limit is 2 KiB. The size comes from the documented parameters and Studio's own auth URL (`google-setup`), not from a live consent screen: the runner holds no Google client.

## Examples

- Given a client without the token,
  when it sends `GET /v1/google/callback?state=…&code=… HTTP/1.1` and a second request in the same write,
  then the host gets an `open` and exactly the first head, and the second request is dropped.
- Given a client without the token whose head has `content-length: 0`,
  when the head is whole,
  then the relay closes it, resets it at the host, and forwards none of it.
- Given a client without the token,
  when it sends `GET /sign-in/<43 base64url characters>?state=…&code=… HTTP/1.1`,
  then the host gets an `open` and exactly that head; `GET /sign-in/too-short` is left to the token deadline.
- Given 4 callback connections open, one with a half-sent head,
  when a fifth client starts a callback request, or 5 seconds pass for the half-sent one,
  then the fifth is closed, and the half-sent one is closed; a client with the token is served throughout.
- Given a callback-only connection and the host's answer that ends,
  when the host sends `end`,
  then the relay closes the connection, though its client never ended it.

## What it doesn't cover

The host's side: its routes, the `Host` and `Origin` checks, the `state` proof, which pending sign-in a `/sign-in/` path belongs to, and the page it answers with (HAL-10029, HAL-13427). The random part is not a secret to the relay: it only narrows what passes, and the `state` is the proof. Any process on the same Windows machine can fill the 4 places for 5 seconds at a time, so a sign-in fails and the user retries; the connections with the token are not affected. A process that takes the relay's port after a crash would see the callback's code; the code is useless without the PKCE verifier the host holds.
