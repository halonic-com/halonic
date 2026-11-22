# Decision: add organisations to the users block in deployments.yaml

- Approval: HAL-16550
- Kind: internal

Slice S1-1b of the selling layer (design on HAL-12483, section 2) adds an
optional `organisations` list to `users.config` in `deployments.yaml`: an
`id` (`org_…`), a pool of `limits` in the shape of a limit, an optional
`concurrency` and `members`, each with an `actor` (`eu_…`), a `role`
(`owner`, `admin` or `member`) and optional `limits` and `concurrency`. It
holds no secret and refuses unknown keys. The requirement
`format.deployments-users` is extended with these checks and the warning
below; none of its existing items is weakened or removed.

The golden JSON Schema `deployments.schema.json` gains the list to match.
Nothing that was valid before becomes invalid: the list is optional, and a
file without it parses as before. The one new warning, for `meter: config`
with no limits, doesn't fail a file. No test was weakened or removed.

## Covers

- format.deployments-users
- packages/core/format/spec/deployments.schema.json
