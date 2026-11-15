# Decision: a Worker's provider keys are read-only, and `PUT` and `DELETE` answer 409 `keys_read_only`

- Approval: scope decided on HAL-9931 (Liam); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:NKPNt2HFfIDUbXTZEBDbk8C85iR1iKOeF/6mzU1x94I6q291tqVu3VLq70qZLJOHFMBi0UWD7G0o40gbkvoACw==

## What changes

`server.secrets-refusals`: the order of refusals is unchanged. One step is added after every existing
check: a store whose keys are fixed where the server runs throws `ProviderKeysReadOnlyError` from `set`
and `remove`, and `PUT` and `DELETE` then answer 409 `keys_read_only`. The body is the same fixed body
whatever the name, and nothing is logged. One example is added (a `PUT` over HTTPS that passes every
check gets 409; over plain http to a non-loopback name it is still 403 `secure_connection_required`).
No existing check or example was removed or weakened.

`runtime.serve`: the Worker's provider keys are its Workers secrets, set at deploy time. `GET` says
whether one is set and never its value. `PUT` and `DELETE` pass the same checks as on any host, then
answer 409 `keys_read_only` with a message that names no secret. Two examples are added. The scheme
sentence also changes: it was "every request counts as HTTPS", and is now "the scheme of the request
URL", so a plain-http request gets no `Secure` cookie and the HTTPS check on `PUT` can refuse it.

## Why

A Worker can't change its own secrets, so a `PUT` or `DELETE` must not pretend to save or remove a key.
The refusal lives in the store, so every host that has such a store gets it, and it comes last so a
caller still learns about a wrong site, name, content type or connection first, and the answer leaks
nothing about which secrets exist. Reading the scheme from the request URL lets that connection check
work on the Worker instead of treating every request as secure.

## Covers

- server.secrets-refusals
- runtime.serve
