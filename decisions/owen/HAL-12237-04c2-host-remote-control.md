# Decision: a phone just paired isn't counted as connected yet

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12237 (for Liam, CTO, to sign with the review of B2 PR 4c-2)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Xvd+h6TIxYmT/ut9GeWs+ZBtU2iyNZGYSegZXLnbPvJ6PETfcm61zBgHufchpHgR9Y8f9Cpxnszck5tJ2YURAQ==

The `RemoteControl` contract asked that Allow pair the phone "connected": the `paired` event's phone had `connected: true`. The fake did that because it had no session to wait for. The agent host can't: by the ADR "Pairing and the end-to-end session" and `agent-host.remote-paired-phones`, a phone counts as connected only once its first transport message decrypts, which comes after the host has sent `paired`. Saying `connected` before that would show a phone as connected whose session may never open.

**`contracts.remote-control`** drops "connected" from what Allow gives, in the text, the example and the test. Allow still pairs the phone, and the list still holds it. Nothing else changes: the fake still marks a phone it pairs as connected, which the contract allows, and the host's state shows the phone connected once the gateway (B3) reports its first message. No other implementation and no Studio screen reads `connected` from the `paired` event.

## Covers

- contracts.remote-control
