# Decision: the guard's npm package check follows versions with a peer suffix

- Approval: HAL-7719 (Liam, CTO)
- Kind: user-visible
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
