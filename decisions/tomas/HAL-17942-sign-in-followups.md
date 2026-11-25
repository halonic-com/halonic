# Decision: the host holds an approved sign-in until Studio confirms the keychain has its key

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17942 (Liam's findings 1 to 3 from the review of #5805, approved on head `8ca846d`)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:wWomMtXsZ7+hVXdNcsJCIebrNN4/G90h/TsGqMLFZl9LQquokCejfmo5pH+XZl+mG/Is8q/6Y12sg88zLoCBBw==

After the approved poll handed the key to Studio, the host ended the sign-in
at once. If that answer never reached Studio, or Studio closed before its
keychain write, the key stayed working in the host's memory and was never
revoked. And when the keychain write failed, Studio's Disconnect revoked the
key but left the new connection's file behind as a signed-out row.

**What changes.**

- `agent-host.paperclip-sign-in`: the host holds the sign-in until Studio
  confirms (`POST /v1/paperclip/sign-in/confirm`). A cancel after the approved
  answer, or no confirm within one minute (a `Scheduler` timer), revokes the
  key, forgets it, stops the provider and removes the connection file this
  sign-in wrote. An existing connection keeps its file.
- `services.host-agent-connections`: after the keychain write, Studio
  confirms. When the write or the confirm fails, Studio cancels the sign-in
  instead of disconnecting, and removes a keychain entry it wrote. The test
  that checked the disconnect now checks the cancel.
- `agent-host-client.paperclip-sign-in` adds `confirm`. The desktop shell lets
  the page call the new route.
- The host's routes keep no list of open sign-ins: the engine's state now names
  the connection, and the engine's timer already drops a sign-in nobody polled.
- The tests that said the engine holds no key right after the approved answer
  now confirm first.

**What doesn't change.** Nothing is weakened:

- the approved answer is still the only one that holds the key, once;
- every other answer, log line, error and file still holds no key;
- Disconnect, the request lists and the `/api/board-api-keys` ban stay as they were.

## Covers

- agent-host.paperclip-sign-in
- services.host-agent-connections
- agent-host-client.paperclip-sign-in
