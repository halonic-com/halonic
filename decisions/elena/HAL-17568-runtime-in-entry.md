# Decision: `@typescript/typescript6` may ship in `adapter-toolscript-check` through `runtimeIn`

- Task: HAL-17568 (T3 of the ToolScript track, HAL-17560)
- Approval: Liam chose option 1 on HAL-17568 (26 Nov); Liam signs this note in review
- Kind: internal

## What changes

- `tooling/check/dependencies.json`: the `@typescript/typescript6` entry adds
  `@halonicjs/adapter-toolscript-check` to `allowedIn`, `adapters` to `layers`, and
  `"runtimeIn": "@halonicjs/adapter-toolscript-check"`, with the reason "the TypeScript JS API
  until 7.1 ships its own; remove then". The field itself landed earlier
  (`decisions/elena/HAL-17568-runtime-in.md`); this is its first use.
- `docs/guides/dependencies.md` names this use.

The package that uses the entry, `packages/adapters/toolscript-check`, lands afterwards in its own
pull request. CI's "Policy rules (base commit's copy)" job reads the allow-lists from the base
commit, so the entry has to be on `main` before a package can use it.

**Trust:** no new library and no lockfile change. No trust root changes.

## Why

The ToolScript checker needs a TypeScript syntax tree and `transpileModule`, and the repo's
`typescript` is 7.0, which has no JS API. See the `runtimeIn` note for why a named exception beats
a dev dependency.

## Tests

No test was skipped or weakened.

## Covers

- tooling/check/
