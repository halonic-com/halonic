# Decision: the guard's package.json is a trust root, and a test keeps its package imports to a short list

- Approval: HAL-1337, the board's design for guarded trust roots, which this closes a gap in; follow-up of the review of halonic#2249 on HAL-7701
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:+BzWD9tdMblxrwwtNuejDACo+oabiLLIFcl2zdy/ivKYi8mtjUuJcT0B6ZFHOsy/ntKe4aSNVKmtlGVMtTekAw==

`tooling/check/package.json` pins the one npm package the guard loads, the TypeScript parser (`@typescript/typescript6`), so a change there could change what the guard runs. It now needs two guardians' signatures like the other trust roots. A test walks the guard commands' imports and fails on any other package: `guard-notes` (which runs with no install) may load none, and `requirement-guard` only the parser. The catalog entry and lockfile entries for the parser are covered separately on HAL-7719, because lockfile changes are too frequent to guard whole.

## Covers

- tooling/check/
- check.guard-two-guardians
- check.guard-notes-own-paths
