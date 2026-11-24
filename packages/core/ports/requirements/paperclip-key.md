# ports.paperclip-key

- Status: draft
- Since: unreleased
- Source: HAL-17422 plan, approved by the board on HAL-10 (24 Nov), with the board's direction of 24 Nov 10:18 and 10:20 UTC (apps talk only to the engine; desktop and server engines); ADR `docs/adr/2026-11-24-agent-messaging.md`; sign-in test HAL-17423 (a board key can make more keys); Julian's security review HAL-17436 (findings 1, 4, 5 and 7). Draft until track A's engine side lands; it then moves to the package that holds the code and becomes active.

The Paperclip provider's key shall be kept in the OS keychain, in one entry per connection that also records the address (scheme, host and port) and the company it was made for, and in the engine's memory only; no app, file, log line, error or answer shall hold it, and it shall be sent only in the `Authorization` header. Before every call the provider shall compare the connection file's address and company with the recorded ones and, if they differ, make no call and ask the user to connect again. The provider shall use `https`, allowing plain `http` only to `localhost`, `127.0.0.1` and `::1`, shall never turn off certificate checks, shall refuse every redirect, shall send only the requests on its fixed list, with every ID encoded as one path segment, and shall never call a Paperclip route that makes, lists or deletes keys. Disconnecting shall revoke the key in Paperclip and delete its keychain entry and cache, and shall still delete them, and tell the user, when the revoke fails.

## Examples

- Given a connected `halonic.yaml`,
  when its address changes to `https://evil.test`,
  then no call is made and Studio asks to connect again.
- Given a connection to `https://paperclip.acme.test`,
  when Paperclip answers a call with a redirect, even to the same host,
  then the provider doesn't follow it and the call fails.
- Given an inbox item whose ID is `x/../../agents/y`,
  when it is answered,
  then the provider sends no request and refuses it.
- Given a client error after a failed call,
  when it is logged,
  then the log holds neither the key nor the request's headers nor the failed answer's body.
- Given a connected Studio that is offline,
  when the connection is disconnected,
  then its keychain entry and cache are deleted and Studio says the key stays valid until its expiry and can be revoked in Paperclip.
