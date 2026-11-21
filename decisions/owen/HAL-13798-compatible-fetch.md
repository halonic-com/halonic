# Decision: Studio sends a sandboxed agent's key to its provider's own address

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13798 (Liam, CTO; agreed on HAL-14917), security review on HAL-13798
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:2W9V3Z0V92HQjtgeop+igd9TR1Qpts6hE1Ex76Hc6W1nLGntwaoluIOrZ0pTWhdzeYI6ptllIqCSKBWBMqiTAg==

`studio.harness-provider-key` said Studio stops a sandboxed harness agent whose
provider has its own address (`baseUrl`), because the agent host's bridge had no
client for that address. The agent host now gives its bridge a `compatibleFetch`
that checks the address as a connector's address is (`connectorHostClass`), the
same rule the CLI's bridge uses, and its open-bridge schema takes a key access's
`baseUrl`, `providerId` and `models`. So Studio drops the refusal: such a
provider gets the engine's usual check (a non-default address needs a trusted
workspace and the key's allowed addresses), and the bridge sends the key only
to that one origin and only for the agent's own model. The requirement's first
stop condition and its example are replaced by examples of the provider being
served and of the check refusing it.

## Covers

- studio.harness-provider-key
