# @halonicjs/tooling-check

Our own repo checks: package manifests, layers, dependencies, names, the
Studio's feature list, file size, the lockfile, absolute local paths,
licences and the personal-terms guard, plus the slots for the Phase 1
traceability, requirement-guard and DCO checks. Imports are read with the
TypeScript parser, not regular expressions.

- **Layer:** tooling
- **Owner:** mateo
- **Commands:** `pnpm verify [--full]`, `pnpm check [rule …]`, `pnpm check:terms`,
  `pnpm check:licences`, `pnpm check:pr-title`
- **Settings:** `policy.json` (core order, published packages, file size),
  `dependencies.json` (approved external dependencies),
  `licences.json` (licence allow-lists),
  `terms-allowed-phrases.txt`

What each rule checks, and how to fix a failure, is in
[docs/guides/checks.md](../../docs/guides/checks.md).

Uses `@typescript/typescript6` for the parser API until TypeScript 7.1
ships its own (D9); then that dependency goes.
