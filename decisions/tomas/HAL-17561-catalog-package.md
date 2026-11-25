# Decision: a new core package for the stepper catalog, and the check that keeps its hashes current

- Approval: HAL-17561 (stream HAL-17488, steppers architecture note on HAL-17491, revision 13, sections 1.2 and 4.2) names the package `packages/core/action-catalog`, owner Tomas, right after `core/action-steppers` in `coreOrder`, and a `pnpm check` rule that fails when its generated hash file is out of date. It changes `tooling/check/`, a trust root, so both guardians sign: Julian, then Liam
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:thJT7JHox97CdPVwYuXBbheynEu56ltF9qAj6rnHOuXwM1q/evjKGwbiv6M9Nr1KK6Ey+IECwQ5XVnt/bZ5OAw==
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:vUV+XEI1HahF9+0KQL+Zzh/o9ZPsHyZe0Y7cSJZ+8lMYYrCDysQ2lGHVb3KKAkeYszZ7yXF0qdVF07gSCSMBCA==

## What changes

A new core package, `@halonicjs/action-catalog`, will hold the reviewed stepper definitions, one file each under
`src/<service>/`. CI runs the policy rules from the base commit's copy, so a new core package lands in two steps
(`docs/guides/checks.md`): this pull request adds the package with no core dependencies and its discovered list, still
empty. The catalog code, the first definition (`github.upload-social-preview@1`) and its manual guide follow in #5903,
which then depends on `action-steppers` and `std`.

In the guard:

- `tooling/check/policy.json` adds `@halonicjs/action-catalog` to `coreOrder`, right after `@halonicjs/action-steppers`.
- A new rule, `catalog-hashes` (requirement `check.catalog-hashes`): a package that declares
  `"halonic": { "catalog": { "export": "<name>" } }` must commit a `src/catalog.generated.ts` listing exactly its
  `src/<group>/<name>.ts` files, each with the SHA-256 of its current source. A changed or added definition without
  `pnpm discover --fix` fails the check, so a reviewer sees every changed definition and its new hash in the diff.
  `tooling/check/src/index.ts` exports the rule's helpers for `tooling/discover`, which writes the file with `--fix`.

The rule only adds a failure; it allows nothing that was refused before.

## Tests

No test is weakened. `tooling/check/src/test/catalog-hashes.test.ts` covers a current file, a changed definition, an
added definition, a badly named entry and the empty catalog's exact text. The package's own test pins the empty list.

## Covers

- tooling/check/
