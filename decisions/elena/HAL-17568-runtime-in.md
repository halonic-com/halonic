# Decision: one adapter may ship a dev-tooling library, named in `runtimeIn`

- Task: HAL-17568 (T3 of the ToolScript track, HAL-17560)
- Approval: Liam chose option 1 on HAL-17568 (26 Nov). The change reaches a trust root (`tooling/check/src/lib/config-files.ts`), so both guardians sign this note: Liam and Julian
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:YewvTaR5ArjxaXhik9b0qW96khQPK/fvU6foe80EjzVWBtmb8KSOgDBrLiTANyNRBuEX6K1WjCdR1e8oRtg0Cg==

## What changes

- `tooling/check/dependencies.json` may give a `dev-tooling` entry a new field, `runtimeIn`,
  naming exactly one `@halonicjs/adapter-<name>` that its `allowedIn` also names, with `adapters`
  in its `layers`. Only that adapter may list the library in `dependencies` and import it from a
  source file that isn't a test or config file. Every other package keeps the dev-tooling rules.
- `tooling/check/src/rules/dependencies.ts` and `layers.ts` read the field;
  `src/lib/config-files.ts` parses it and fails an entry whose `runtimeIn` is set on a library
  that isn't dev tooling, or that names a pattern, a non-adapter or a package outside `allowedIn`.
  `config-files.ts` is imported by the guard commands, so this is a trust-root change.
- New requirement `check.dev-tooling-runtime-in`; `docs/guides/dependencies.md` describes the
  field.
- No entry uses the field yet. CI runs the guard from the merge base's copy, which doesn't know
  `runtimeIn` until this merges, so the stacked ToolScript checker PR sets it for
  `@typescript/typescript6` after this lands (the two-step rule in `docs/guides/checks.md`).

**Trust:** no new library and no lockfile change. The field widens nothing by itself: each use
names one package, by exact name, in `tooling/check/dependencies.json`, which only the CTO
reviews, so every runtime user needs its own reviewed change there.

## Why

The ToolScript checker needs a TypeScript syntax tree and `transpileModule`, and the repo's
`typescript` is 7.0, which has no JS API. Listing `@typescript/typescript6` under
`devDependencies` with no guard change (option 2) would work today, but once Studio wires the
checker in (T9) a library labelled dev tooling would ship in its bundle, which is what the
dependency rule exists to stop. A narrow, named exception keeps the rule honest until TypeScript
7.1.

## Tests

No test was skipped or weakened. `dependencies-runtime-in.test.ts` (new, 4 tests): the named
adapter may list and import the library, and no other package may; a dev-tooling library with
no `runtimeIn` still fails in `dependencies`;
`runtimeIn` on a non-dev-tooling entry fails; a pattern or a package outside `allowedIn` fails.

## Covers

- check.dev-tooling-runtime-in
- tooling/check/
