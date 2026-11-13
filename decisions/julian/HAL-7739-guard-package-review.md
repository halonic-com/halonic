# Decision: the guard's package.json is a trust root, and a test keeps its package imports to a short list

- Approval: HAL-1337, the board's design for guarded trust roots, which this closes a gap in; follow-up of the review of halonic#2249 on HAL-7701
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:MiGhPhsIAGGToYYk/ej4JKrTxiEFqjm2m/oJ8Aq+A86rJXXIT6jGUsAECgNeQBQnAmvq/G/GhSbozBR5DSuNDA==
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:goXF/naTipxfn0KFkZIr6v20jSH1wBMxn6rkm0ACY5qrrN546rHiTiKv22SD2PL9iNEz58V2f4GVYR9wmohzDw==

`tooling/check/package.json` pins the one npm package the guard loads, the TypeScript parser (`@typescript/typescript6`), so a change there could change what the guard runs. It now needs two guardians' signatures like the other trust roots. A test walks the guard commands' imports and fails on any other package: `guard-notes` (which runs with no install) may load none, and `requirement-guard` only the parser. The catalog entry and lockfile entries for the parser are covered separately on HAL-7719, because lockfile changes are too frequent to guard whole.

## Covers

- tooling/check/
- check.guard-two-guardians
- check.guard-notes-own-paths
