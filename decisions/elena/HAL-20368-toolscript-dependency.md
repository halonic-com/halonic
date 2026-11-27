# Decision: approve `@typescript/typescript6` for `adapter-toolscript-check` ahead of its package

- Task: HAL-20368 (split from HAL-17568, T3 of the ToolScript track, HAL-17560)
- Approval: Liam chose option 1 on HAL-17568 (26 Nov) and approved these hunks on halonic#6716 (head `bd9363e`); Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:pwJdjGcKIrD1fRMigv/ywXO4YTQmp7Xf6BRJG33HkVf4fHm4hDHsGj/0ZSlc1ZYKvGAn6pt/9SYF+h9ttgMYBw==

## What changes

- `tooling/check/dependencies.json`: the `@typescript/typescript6` entry adds
  `@halonicjs/adapter-toolscript-check` to `allowedIn`, `adapters` to `layers`, and
  `"runtimeIn": "@halonicjs/adapter-toolscript-check"`, with the reason "the TypeScript JS API
  until 7.1 ships its own; remove then".
- `docs/guides/dependencies.md` names this use.

These are the same hunks as in halonic#6716 (`decisions/elena/HAL-17568-toolscript-check.md`),
split out so they merge first: CI checks a pull request against the base's
`dependencies.json` (the `Policy rules (base commit's copy)` job), so halonic#6716 can't approve
its own use of the library.

**Trust:** no new library and no lockfile change. The package these entries name doesn't exist
until halonic#6716 merges, so nothing on `main` starts using the library through this pull
request. No trust root changes.

## Why

The ToolScript checker needs a TypeScript syntax tree and `transpileModule`, and the repo's
`typescript` is 7.0, which has no JS API. See `decisions/elena/HAL-17568-runtime-in.md` for why a
named exception beats a dev dependency.

## Tests

No requirement, test or golden file changes. No test was skipped or weakened.

## Covers

- tooling/check/
