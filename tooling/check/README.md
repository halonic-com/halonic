# @halonicjs/tooling-check

Our own repo checks: package manifests, `AGENTS.md` files, layers, dependencies, security advisories,
`deny.toml`, names, the Studio's feature list, file size, the lockfile, absolute local paths,
process starts, invisible characters, native `disabled` on buttons outside the Studio kit, README
examples, versions, public API specs, licences, the leak guard with its git hooks, the traceability
check between requirements and tests, the requirement guard with signed decision notes, and the DCO
sign-off check. It also syncs the app version and the released API specs.
Imports are read with the TypeScript parser, not regular expressions.

- **Layer:** tooling
- **Owner:** mateo
- **Commands:** `pnpm verify [--full]`, `pnpm check [rule …]`, `pnpm check:enqueue`,
  `pnpm check:leaks`, `pnpm check:licences`, `pnpm check:audit`, `pnpm check:sbom`,
  `pnpm check:bundle`, `pnpm check:pr-title`, `pnpm check:coverage-floors`,
  `pnpm decision sign <pull request number>`, `pnpm version:sync`,
  `node tooling/check/src/cli/requirement-guard.ts` (CI runs it)
- **Public API:** `src/index.ts`: `rules`, `loadContext`, `Report` and the layout helpers, so
  `tooling/discover` and tests can run the rules. The command lines are in `src/cli/`.
- **Settings:** `policy.json` (core order, published packages, file size),
  `dependencies.json` (approved external dependencies),
  `licences.json` (licence allow-lists),
  `overrides-allowed.json` (approved pnpm overrides),
  `patches-allowed.json` (approved pnpm patches, each with its file's hash),
  `process-starters.json` (approved process starters),
  `approvers.json` (the keys that sign decision notes, by kind),
  `advisories-ignored.json` (ignored security advisories, each with a reason and expiry),
  `leak-allow.txt` (leak guard false positives),
  `terms-allowed-phrases.txt`

What each rule checks, and how to fix a failure, is in
[docs/guides/checks.md](../../docs/guides/checks.md); the leak guard is in
[docs/guides/leak-guard.md](../../docs/guides/leak-guard.md).

Uses `@typescript/typescript6` for the parser API until TypeScript 7.1
ships its own (D9); then that dependency goes.
