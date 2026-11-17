# Decision: the guard's npm package check follows versions with a peer suffix

- Approval: HAL-7719 (Liam, CTO)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:E39GpN9SydKNr3J3Bi0fgNCV/HVTjpDu2MNcwuaBNIlqutHrzJ2x74iXpV9Qf2QYzw/XkJ3fvx1FaPSI/5C2Bw==
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:T7zaw5dapIym95YZkr1zw9ykTMmV8/MwOnh1QPt1tLb6wEPcSrOpJgMR2+rzxOybyQVf6phI5vXvsFZ5fpc0Aw==
- Task: HAL-7719

A dependency of the guard's parser whose lockfile version carries a peer suffix, such as
`1.2.3(bar@2.0.0)`, was read as an alias because it contains `@`. It was then looked up under the
wrong id, so a change to its entry went unreported. Today's lockfile has no such entry.

## Covers

- `tooling/check/`
- `check.guard-dependency`

## What changes

- The reader strips the peer suffix before it decides whether a version is an alias, so these
  entries are followed like any other. A test covers it.
- Nothing else changes: the rule, its wording and its known gaps stay as in
  `decisions/julian/HAL-7719-guard-npm-deps.md`.

## Why

The check should keep working when the lockfile starts using peer suffixes, instead of silently
missing the entries.
