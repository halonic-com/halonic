# Decision: the CTO's key is pinned for `user-visible` decision notes

- Approval: HAL-8506; the board approved "`user-visible` and `internal` on Liam's key" on HAL-1337 on 12 Nov
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:/S9Hjtl6fdoIfjubk4iYYk6lUG8z+iaeTwEcT1e6vCntA8HjLl1VUz2RljB19zUY4kHPSC34WsI6AZ05PwI9CQ==
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:jJt2t1HJVPbnDs2rn+SpDkPXKQIw0MqY09AaD8aNMUxXRDQJYv3qbb5x3lVoZQpw34SL9mWpiosff46ndwShCg==
- Task: HAL-8507

## What changes

`tooling/check/approvers.json` lists the CTO's key under `"user-visible"`, copied exactly from the `"internal"` entry (same `id`, `holder` and `publicKey`). Nothing else in the file changes. `docs/guides/checks.md` and `AGENTS.md` already say the CTO's key approves both kinds, so no doc changes.

This makes the pinned keys match the approved rule and the docs. Until now `"user-visible"` was empty, so no `user-visible` note could pass, and a change users see had to be written as `Kind: internal` (#2450).

## What it widens

The CTO's signature alone can now approve a `user-visible` note. That includes the guard's own paths that are not trust roots: `packages/testing/spec/`, `packages/testing/parity/allowed-differences.json`, `tooling/config/src/vitest-preset.ts` and `turbo.json`. Those paths are frozen today, and the docs already describe them as CTO-signed. Trust roots (this file included) still need two different guardians' signatures, and the pull request can't add its own key because the guard reads `approvers.json` from the base branch.

## Covers

- tooling/check/
- tooling/check/approvers.json
