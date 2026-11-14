# Google sign-in answers on a loopback callback with no session, and the setup record holds no secret

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

Halonic signs you in to Google with your own Google client (a Desktop-app
client). Google sends the browser back to a loopback address with a one-time
code. Three things had to be decided: how the host takes that request, where
the setup's state and secrets live, and how a setup is tied to the connector
that uses it.

The browser that finishes a sign-in may hold no Halonic session: on desktop it
is the system browser, not Studio's window. So the callback can't ask for the
sign-in the other routes ask for. And the client secret and refresh tokens must
not sit in a place a hub, an agent or a log can reach.

## Decision

**The callback sits outside the session, and `state` is the proof.**
`GET /api/google/callback` needs no session. The sign-in's own `state` (32
random bytes, made when the sign-in starts) proves the request belongs to it,
and the sign-in package refuses any `state` it didn't make. Every other Google
route stays behind the sign-in. The start route, `POST
/api/google/setups/<ref>/sign-in`, is one of them: it starts the sign-in and
answers the address to open.

**Both routes are for this computer only.** The start route refuses a request
that isn't addressed to a loopback name (409 `sign_in_needs_this_computer`),
because Google sends a Desktop-app client back to a loopback address only. The
callback answers 404 on any other name, so a served instance doesn't expose it.
The `Host` and `Origin` checks still run first.

**The callback answers a fixed page.** The page is plain HTML with no script
and one fixed sentence per outcome. Nothing from the query, from Google's
answer or from the saved record goes into it. It carries the server's usual
headers: `Cache-Control: no-store`, `Content-Security-Policy: default-src
'none'; frame-ancestors 'none'`, `Referrer-Policy: no-referrer`,
`X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`. The request log
records the callback by method, path and status, never the query string, which
holds the code and `state`.

**A dead link gets a page and no event.** A callback whose `state` matches no
pending sign-in has no account, and anyone on this computer can make one. So it
gets the "no longer valid" page, publishes no event to the open setup item and
changes no record. Every other outcome is published first, then written to the
record, because the sign-in has ended whether or not the record can still be
updated.

**The setup record holds no secret.** Setup records live in the profile, in
`<profile>/google/setups`, as a collection with Halonic's own `_` prefix, so no
hub or agent can name it. A record holds the client ID, the project, the
account, the services and how the last sign-in went. The client secret and the
refresh tokens are sealed in `<profile>/google/tokens`, and no route, record or
command returns them. Studio on desktop reads the records through one
read-only command, `google_setup_read`: it takes no argument, can't name a
folder, never reads `google/tokens`, and is granted to the app's own window
only. The CLI's host writes the records; Studio can't.

**The setup record points at its connector.** A record holds `connector: {
workspace, id }`: the workspace's key in the profile (32 lower-case hex
characters) and the connector's id in it. `setups.start` requires it, and
`forConnector` finds the record for a connector, matching both. The link sits
in the record and not in the connector file, because the connector file is in
git and an account ref exists on one machine only. The workspace is part of the
link because two workspaces in one profile can each have a connector `gmail`.
A record without a valid link reads as damaged.

**A token left by a deleted setup is removed.** If the setup is deleted between
the start and the callback, the callback removes the refresh token that
finishing stored and answers the "no longer valid" page. Any other failure to
update the record keeps the token, because the record still names it and
Disconnect finds it.

## Consequences

- A forged, replayed or stray callback changes nothing: a wrong `state` is
  checked first and the pending sign-in is taken once.
- The callback can't be reached from another computer, and a web page can't
  read or frame its answer.
- Studio can show every setup and its connector without ever holding a secret.
  The cost is that Studio can't change a setup: changes go through the host.
- Contributors who add a Google route decide whether it needs the session. The
  default is yes. A new route outside it needs a record like this one.
- The tests that keep this true are the requirements `server.google-sign-in`,
  `google-setup.connector-link`, `google-setup.setup-record-holds-no-secret`,
  `studio.src-tauri.google-setup-command` and `fs-tauri.google-setup-records`.
  The last two fail if the command takes an argument or the store writes.

## Changed from an earlier decision

The draft requirement `google-sign-in.callback-route` described a one-shot
server on its own port that closes after the first callback. The route is part
of the host's own server instead, so a closed-after-one-use listener, and its
host-and-port check, are replaced by the loopback check above and the host's
`Host` check.
