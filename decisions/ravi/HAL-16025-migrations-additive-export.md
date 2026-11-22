# Decision: export the migrations-additive statement finder through an import-free subpath

- Approval: HAL-16025 (Liam, CTO), the export Cloud needs, asked for in the review of cloud#5 on HAL-13532
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:t43CK8M0X639L4Lm6W0/nk3uI0ey2dCiSspJKoe7/wG60LgYLQhqwtFvimD0kxBiCmiscfMbrpAL0yUdclmqAQ==

Halonic Cloud's control plane runs its D1 migrations with halonic's
`runMigrations`, and its requirement `control-plane.database` says
migrations only add. To check that with the same rule halonic uses, Cloud
needs `findDestructiveStatements` without pulling in the rest of
`@halonicjs/tooling-check`, whose entry point loads TypeScript 6.

- `findDestructiveStatements` and its patterns move unchanged from
  `src/rules/migrations-additive.ts` to `src/lib/destructive-statements.ts`,
  which imports nothing. The rule imports it from there, so what the rule
  reports doesn't change.
- `tooling/check/package.json` exports that file as
  `@halonicjs/tooling-check/migrations-additive`. It points at the new file,
  not the rule, because the rule's type import of `lib/context.ts` still
  reaches TypeScript 6.
- A test fails if the new file ever gains an import, so the subpath stays
  light for Cloud.

No requirement text changes, and no rule loosens. The `exports` map in
`tooling/check/package.json` is a trust root, so this note needs both
guardians' signatures; the package's dependencies don't change, so the guard
loads nothing new.

## Covers

- tooling/check/
