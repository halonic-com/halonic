# Decision: a `./list-column` subpath export for the Studio kit

- Task: HAL-20769, one list-column size for every new-design screen
- Approval: Liam chose option A (one kit value, `listColumnClass`, with a 208px floor) on HAL-20769
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:PEYXHyWDRPTYVrB9a3lPF1Qsedfnak9Ter8DQAlpmMyt5TdFf4PFGb1USut4tgRjrBCjEN+cVRBugqfz9EO1Aw==

## What changes

`tooling/check/policy.json` gets one line: `./list-column` joins `./app-glyphs`, `./fonts` and
`./settle` under `extraExports` for `@halonicjs/studio-kit`. The kit's `package.json` exports
`./list-column` from `src/list-column/list-column.ts`, which holds only the `listColumnClass`
string.

## Why

The kit's `src/index.ts` is at the 480-line cap a pull request may grow a file to, so the new
value can't join the main entry point. A subpath, as `./settle` already is, keeps the index where
it is. Nothing else in the guard changes.

## Tests

No test is weakened or removed. `list-column.test.ts` adds a `buildCss` test for
`kit.list-column`.

## Covers

- tooling/check/policy.json
