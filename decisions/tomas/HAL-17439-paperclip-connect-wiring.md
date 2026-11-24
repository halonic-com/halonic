# Decision: the approved sign-in hands its key to Studio once, and a new connection gets its file from the sign-in

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17439 (Liam accepted option 1 for the key on 24 Nov, 18:55 UTC); https://paperclip.halonic.com/HAL/issues/HAL-17897 (the board can't connect in the preview build, 24 Nov, 22:20 UTC)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Q648IepWYMNlEEuFX8+cSJ+gn95ADzTP3yTNPGBbgU4mmGzuXULLHzmjfRewzn9onAoR4RaZUk8DB1LqxVfSBQ==

`agent-host.paperclip-key` said that no answer holds the key. But the engine
gets the key at sign-in and the keychain is Studio's: the host can't write it
(the plugin-secrets ADR). Liam chose option 1 on HAL-17439: the first approved
poll's answer carries the key once, and only `studio/services`' sign-in code
reads it, writes it straight to the keychain and passes on no key. A failed
keychain write makes the engine revoke the key and forget it.

**What changes.**

- `agent-host.paperclip-key` names this one exception, with an example: two polls, and only the first holds the key.
- `agent-host.paperclip-sign-in` adds the host's routes. They take requests only from Studio's own page. A sign-in is for:
  - the named connection file;
  - otherwise the file with the same address;
  - otherwise a new connection named after the address's host.
- A new connection's challenge carries no company (Paperclip uses it only to label its audit log). After approval, `me` must list exactly one company, which goes in the new file. Otherwise the key is refused and revoked. Without this, the empty Settings › Connections, which asks only for an address, could never connect.
- `connections.connect-dialog` adds the ending "Halonic couldn't save the key" for a refused keychain write.

**What doesn't change.** Nothing is weakened:

- every other answer, log line, error and file still holds no key;
- the key's guard, the request lists, Disconnect and the `/api/board-api-keys` ban stay as they were;
- the new connection file holds only the label, the address and the company.

## Covers

- agent-host.paperclip-key
- agent-host.paperclip-sign-in
- connections.connect-dialog
