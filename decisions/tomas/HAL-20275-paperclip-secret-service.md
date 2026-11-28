# Decision: one golden list of the shell's fixed operations

- Approval: /HAL/issues/HAL-20275 (plan approved by Liam on HAL-21110; 6.8 decided on HAL-20274)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:5AIJrj0qUpBBY3mQsBNpVtJT8RQwjq5PwrbfDNz8VhOvyfpDX+6ThwVZxxoJP2H2MApxo54J/az0doNnYtMSCQ==

The shell's `paperclip.set-secret` is a fixed Rust operation, not a route of
method and path, as Liam's plan answer on HAL-21110 asks. `core/ports` names
the operations the page may send as `actionOperations`, and the shell has its
own `OPERATIONS` list in Rust. Julian's review of #6954 asked for one shared
golden file so the two lists can't drift apart.

The new golden file `packages/core/ports/src/golden/action-operations.json`
maps each operation to its service. Today it holds one entry,
`paperclip.set-secret` → `paperclip`. A ports test and a Rust test in
`action-send` both compare their list with it, so adding an operation on one
side only fails a test. No existing golden file or test changes.

## Covers

- packages/core/ports/src/golden/action-operations.json
