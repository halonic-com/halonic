# Decision: `connectorIsLocal` reads an HTTP connector's host as `URL` does

- Approval: Liam decided this on HAL-16339 as owner of the shared core; Julian signs because Liam wrote the pull request
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:TXUwe/cnk/Ay7E/dpgYti7avwaH+ljqMUokpVKe5hrpJBzq0kO/4wiD6dNYJmGzirVj9jItzkosEj6DCx+c9Aw==

## What changes

The requirement's last sentence said how the host is read by hand ("after user info, without
port or brackets, lowercased"). It now says the reading matches `URL`'s: only `http` and `https`
URLs, the host ends at the first `/`, `\`, `?` or `#`, and a host `URL` would read differently
is not local. Two examples are added. Nothing that counted as local through a plainly written
`localhost`, `[::1]` or `127.x.y.z` URL changes; the other examples stay as they are.

## Why

`privacy.localOnly` relies on this check. The hand reading could pick a different host than the
one the transport connects to. Sharing the integration policy's strict host reader
(`parseUrlHost`) means a URL is local only when both read the same loopback host. When in doubt
the answer is "not local", which is the safe side for `localOnly`.

## Covers

- format.connector-is-local
