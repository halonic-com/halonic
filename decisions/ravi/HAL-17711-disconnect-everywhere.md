# Decision: Disconnect forgets the key in every workspace that holds it; a provider that fails to start drops its key

- Approval: HAL-17711, from Liam's review of #5716 (HAL-17438) and Julian's follow-ups on it (HAL-17710, folded into HAL-17711); Liam approves this note in review
- Kind: internal
- Task: HAL-17711

## What changes

`agent-host.paperclip-key` gains one sentence and one example. Disconnect used to forget the key
only in the workspace it was pressed in. Studio keeps one keychain entry per connection name, so a
second open workspace that connected the same connection held the same key. When the revoke failed,
for example offline, that workspace went on polling with a key the person had disconnected. Now
Disconnect also forgets the key, and deletes the source's cache, in every other open workspace that
holds a key for a connection of that name made for the same address and company. A key made for
another address or company is a different key and stays.

`agent-host.paperclip-key-hand-over` gains one sentence and one example. When the host kept a key
but couldn't start the connection's provider, the key stayed held with nothing using it, and the
request failed as an unhandled route error. Now the host forgets the key again, logs only the
error's kind, and answers 502 `provider_not_started`.

No example is removed or weakened; both requirements only say more.

## Why

A key the person disconnected must stop being used on this computer, whether or not Paperclip
revoked it. Dropping the key when its provider fails keeps the rule that every key the host holds
belongs to a connection the person can see and disconnect.

## Covers

- agent-host.paperclip-key
- agent-host.paperclip-key-hand-over
