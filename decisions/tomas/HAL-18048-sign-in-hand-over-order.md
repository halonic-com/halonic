# Decision: the hand-over limit starts after the save, a failed Sign in again keeps the old key, and a lost confirm is sent again

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-18048 (Liam's and Julian's findings from the review of #5847)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:IuGxrRowqDev1z1kMkCy+isdgn3jQWD1xetRRONrsmxHHaXYrLiHLdY8Ayvs+wvx/ehnOZ+L+t6+TJIQgeLLCQ==

The review of #5847 found three gaps in the sign-in hand-over:

1. The host set the one-minute hand-over limit before it stored the key. A
   store slower than that minute left a key Studio never confirmed with no
   timer, so it was never revoked (Liam).
2. When Sign in again failed at the keychain write or the confirm, Studio
   removed the keychain entry and the host forgot the connection's key. The
   connection ended signed out, although its old key still worked (Julian).
3. When the confirm's answer got lost, Studio undid its keychain entry while
   the host kept the key it had confirmed (Liam).

**What changes.**

- `agent-host.paperclip-sign-in`: the hand-over limit starts once the key is
  stored. Until that limit, the host answers a repeated confirm as it did the
  first. Undoing a sign-in for a connection that held a key before puts that
  key back instead of forgetting it and stopping the provider.
- `services.host-agent-connections`: Studio reads the connection's keychain
  entry before it writes the new key, and puts it back when the write or the
  confirm fails. A confirm that failed is sent once more; when that one says
  the host has the key, the sign-in is connected.
- The tests that expected one confirm and two reported failures for a host
  that can't be reached now expect two confirms and three failures.

**What doesn't change.** Nothing is weakened:

- the approved answer is still the only one that holds the key, once;
- a new key nobody confirmed is still revoked, at the latest one minute after
  it was stored;
- the old key put back is one the person already had; the sign-in never
  revoked it, and it never leaves the host's key memory.

## Covers

- agent-host.paperclip-sign-in
- services.host-agent-connections
