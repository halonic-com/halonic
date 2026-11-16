# Decision: a phone's decision on a bridge approval goes to Studio through one typed call

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-10833 (Liam, CTO; review point 1 of HAL-10827, relay design approved on HAL-10835)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:pnXglHB1sYnRaFM1h+QewpqUmr6r7yJVUXU9K9rZ+y81UfC+BlnhR0ijaYtCpwyPT0pRBmlve5RnYC51di+mBw==
- Task: HAL-10833

The agent host gets one new call to Studio on the bridge's call channel, `approvals.remote-decision`,
which carries the call id and the decision a phone made. The host sets the source of the decision
itself, so a phone cannot name another. Studio accepts it only for an approval that is pending right
now, on that run, under that call id; an unknown or already-decided id is refused with a clear
error. The first decision wins. If Studio is away or has no path for the approval, the approval
stays pending and ends as denied, as a call that ends today: never allowed. `agent-host-client.bridges`
lists the new call and its schema. `agent-host.remote-gateway` changes by the clause that a phone's
answer to an approval is relayed through this call instead of being refused, and by the same limit:
until the engine implements bridge approvals (HAL-10849), Studio refuses the call for Claude Code
and Halonic tool approvals. Nothing is allowed that was not before.

## Covers

- agent-host.remote-gateway
- agent-host-client.bridges
