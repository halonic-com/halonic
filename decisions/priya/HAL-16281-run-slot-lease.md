# Decision: a running run's slot has a lease

- Approval: agreed in Liam's review of #5147 on HAL-16243 ([major]), done in HAL-16281
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:UsLdWXiT1LI8AiQRpc33SmbWGswr+XuNZmyhLyDwV254HBMtNy/NlInINXVHDiEDAFrKdMQNVSs1NOxVNxIyBg==

The requirement cloudflare-durable.usage-running gains one paragraph and one example: a run holds
its slot for a lease that each start or renewal begins again, a slot past its lease doesn't count,
the sweep frees it, and a run that renews after its lease ended takes a new slot only within the
cap. Nothing it already said changes. The requirement isn't in a release yet.

## Covers

- cloudflare-durable.usage-running
