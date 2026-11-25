# Decision: tooling-paperclip may dev-depend on the TypeScript 6 parser

- Task: HAL-18987
- Approval: Liam's review note 1 on #5966 (replace the regex purity check with a syntax-tree walk); Liam and Julian sign this note in review
- Kind: internal

## What changes

`tooling/check/dependencies.json` also allows `@typescript/typescript6` (`dev-tooling`, layer `tooling`) in `@halonicjs/tooling-paperclip`.

It is used only in tests: a helper walks the syntax tree of each signal rule (`tooling/paperclip/src/signals/`) and workflow rule (`workflow-host/rules/`) and fails on anything impure: dynamic `import(`, `Date`, `eval`, `Function(`, timers, `process`, network and file access. Today a regex does this and misses those forms. Nothing ships: `dev-tooling` stays out of everything but tests and config files. The CI's `Policy rules` job reads this list from the base commit, so this lands before the PR that uses it.

## Covers

- tooling/check/
