# agent-host.paperclip-key

- Status: active
- Since: unreleased
- Source: HAL-17422 plan, approved by the board on HAL-10 (24 Nov), with the board's direction of 24 Nov 10:18 and 10:20 UTC (apps talk only to the engine; desktop and server engines); ADR `docs/adr/2026-11-24-agent-messaging.md`; sign-in test HAL-17423 (a board key can make more keys); Julian's security review HAL-17436 (findings 1, 4, 5 and 7); the board's sign-in exception, HAL-17714 (24 Nov). Was `ports.paperclip-key` while a draft; moved here with the code that wires the provider, the key's guard and Disconnect into the desktop engine (HAL-17438). Liam's review of HAL-17495: a key is bound to its workspace too, and the host refuses plain `http` to another computer. Liam's review of #5716 (HAL-17711): Disconnect forgets the key in every open workspace that holds it.

The Paperclip provider's key shall be kept in the OS keychain, in one entry per connection that also records the address (scheme, host and port) and the company it was made for, and in the engine's memory only, bound to the workspace it was handed over for; no app, file, log line, error or answer shall hold it, and it shall be sent only in the `Authorization` header. The one exception is the answer that brings a new key to the keychain (Liam's option 1 on HAL-17439): the engine's first `connected` answer to a sign-in poll shall hold it once, and only Studio's sign-in code in `studio/services` shall read it there, write it straight to the keychain and pass on no key; when that write fails, Studio shall have the engine revoke the key and forget it, and shall keep no copy. Before every call the provider shall compare the connection file's address and company with the recorded ones and, if they differ, the file is gone, or the key was handed over for another workspace, make no call and ask the user to connect again. The provider shall use `https`, allowing plain `http` only to `localhost`, `127.0.0.1` and `::1`, shall never turn off certificate checks, shall refuse every redirect, shall send only the requests on its fixed list, with every ID encoded as one path segment, and shall never call a Paperclip route that makes, lists or deletes keys. The one exception is sign-in (the board's decision on HAL-17714): only the engine's sign-in flow may start, poll and cancel a sign-in challenge, through a separate list of exactly those 3 requests, none of which carries a key. Disconnecting shall revoke the key in Paperclip and delete its keychain entry and cache, and shall still delete them, and tell the user, when the revoke fails. Disconnecting shall also forget the key, and delete the source's cache, in every other open workspace that holds a key for a connection of the same name made for the same address and company.

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
- Given `halonic.yaml` connected in one workspace,
  when another workspace holds a `halonic.yaml` with the same address and company,
  then no call is made for the other workspace until the person connects it there.
- Given a connected Studio that is offline,
  when the connection is disconnected,
  then its keychain entry and cache are deleted and Studio says the key stays valid until its expiry and can be revoked in Paperclip.
- Given `halonic.yaml` connected in two open workspaces with the same key,
  when it is disconnected in one of them while the revoke fails,
  then the next poll sends no request with the key for either workspace, and both show the connection with no key on this computer.
- Given an approved sign-in,
  when Studio polls it twice,
  then only the first answer holds the key, and the connection's state that Settings shows holds none.
- Given the sign-in request list,
  when it is read,
  then it holds only start, poll and cancel of a sign-in challenge, and none of its requests carries a key.
