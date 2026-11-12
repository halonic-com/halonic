# Decision: land the Windows fence case for a running session's folder as a known failure

- Approval: HAL-5882
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:U8iH22UnW8khSf1Y3+NTTfJKPPGL26AVBTN8dXiiV0Iqz9L7l+iA5o3eZPk5VLmDmYXwD3aocO3gkoY7lq8HBw==

`srt-reopen.windows.test.ts` checks that a second sandboxed session can't
read a folder the first one, still running, wrote and its profile denies.
It fails on Windows: srt runs every sandboxed program under one account and
sets its grants on the folders themselves, where they win over a deny a
folder inherits from a denied parent. Liam decided in HAL-5882 to land this
as a known limit (threat model 4.6), with the case marked `it.fails`, so it
turns into a failure, and back into a plain case, once srt keeps sessions'
reads apart.

## Covers

- packages/adapters/sandbox-srt/fence/srt-reopen.windows.test.ts
