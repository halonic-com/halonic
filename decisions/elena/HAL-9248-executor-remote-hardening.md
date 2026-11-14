# Decision: the remote executor refuses a password over plain http, keeps a split CRLF whole and times out its sign-in

- Approval: https://github.com/halonic-com/halonic/pull/2656#issuecomment-6880117504 (Liam's review on HAL-9265; the three fixes were asked for by Julian and Liam in the review of #2639, HAL-9248)
- Kind: internal

## What changes

`executor-remote.session` now says that `createRemoteExecutor` throws a `RangeError` for a password with a
non-loopback `http:` base URL unless the caller sets `allowPlainHttp`, and that the sign-in request times out
(30 seconds unless `loginTimeoutMs` says otherwise) as a try that can be repeated. Two examples are added.
`executor-remote.sse` now says that a `\r\n` is one line end even when the chunks cut between the two. One
example is added. No example is removed.

## Why

The sign-in password must not travel in the clear to a host that isn't on this machine. A host that stops
answering the sign-in held every waiting call forever. A CRLF cut between two chunks was read as two line
ends, which could end a message early. The package has no caller yet, so nothing else changes.

## Covers

- executor-remote.session
- executor-remote.sse
