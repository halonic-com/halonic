# Decision: refuse a repeated unit and period in an organisation's limits

- Approval: HAL-16577
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:saRhQf24clYxKV8XzZLtN3nPrD9Dba4LcRMAY3A8S74+jHRTzbPUsL7bdVZkDQy3aTiR4lAABLXYyh6V3ff7AQ==

Follow-up to HAL-16550 (#5305), from its review. The requirement
`format.deployments-users` already refuses two limits on the same unit and
period in `users.config.limits` (`users-limit-repeated`). It gains one item
saying the same for an organisation's pool `limits` and for one member's
`limits`, with the same code, and one example. For a member it also keeps
the pool check unambiguous: each pool limit is then the only one on its
unit and period.

`users.config.organisations` came with HAL-16550 and is still `Since:
unreleased`, so no released file that was valid becomes invalid. None of the
requirement's existing items is weakened or removed, and no test was
weakened or removed.

## Covers

- format.deployments-users
