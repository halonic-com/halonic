# Decision: one adapter may ship a dev-tooling library, named in `runtimeIn`

- Task: HAL-17568 (T3 of the ToolScript track, HAL-17560)
- Approval: Liam chose option 1 on HAL-17568 (26 Nov); Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:hi1Jy+nTX79Rl7vwpTb3d6E4gFtVs0nHWsWAd7n33BrUDaojscm2OHVL2G1ob9bMKMUaHqErg79d24hAvZ67CQ==

## What changes

- `tooling/check/dependencies.json`: a `dev-tooling` entry may carry a new field, `runtimeIn`,
  naming exactly one `@halonicjs/adapter-<name>` that its `allowedIn` also names, with `adapters`
  in its `layers`. Only that adapter may list the library in `dependencies` and import it from a
  source file that isn't a test or config file. Every other package keeps the dev-tooling rules.
- `@typescript/typescript6` gets `"runtimeIn": "@halonicjs/adapter-toolscript-check"`, so the
  ToolScript checker (stacked PR) can use the TypeScript JS API at run time. The repo's
  `typescript` is 7.0, which has no JS API; the entry's reason says to remove this once 7.1 ships
  its own.
- `tooling/check/src/rules/dependencies.ts` and `layers.ts` read the field;
  `src/lib/config-files.ts` parses it and fails an entry whose `runtimeIn` is set on a library
  that isn't dev tooling, or that names a pattern, a non-adapter or a package outside `allowedIn`.
- New requirement `check.dev-tooling-runtime-in`; `docs/guides/dependencies.md` describes the
  field.

**Trust:** no new library and no lockfile change. The field widens nothing by itself: each use
names one package, by exact name, in a file only Liam reviews (`tooling/check/`), so a second
runtime user needs another reviewed change to `dependencies.json`.

## Why

The checker needs a TypeScript syntax tree and `transpileModule`. Listing the library under
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
