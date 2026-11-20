# Decision: barrels that only re-export don't count against the file-size limit

- Approval: the board approved the change on HAL-14368 as the queue fix allowed under the PR freeze (HAL-14331, rule 4); Julian reviewed it on HAL-14372, Mateo checks it there because Liam wrote it, and Liam and Julian sign as the two guardians, because `lib/context.ts` and `lib/source-files.ts` are trust roots
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:j/+RYpMtpt1FHKO4ee/xmltoGvU2Ic1b+mfQlaHtCSyEu16DWqj7zXRQEII1sSLDl9gDFNCWDFMQSRTfQOUPDQ==
- Task: HAL-14368

## What changes

The `file-size` rule skips a TS/JS file whose statements are all `export … from "…"`,
`export * from "…"` or `export type … from "…"`, each with a quoted path (comments allowed).
`readSourceFacts` in `lib/source-files.ts` decides it on the TypeScript parse tree and adds
`reExportsOnly` to the facts that `lib/context.ts` hands to the rules. Any statement of its
own (a declaration, an import, a local `export { x }`, a directive, an empty `;`, a path that
isn't a string literal, or import attributes) makes the whole file count. The limit for real
code stays at 500 lines, and the function-length rule still runs on barrels.

The guard itself reads nothing new: `reExportsOnly` is a new field that only `file-size` uses.
No requirement is edited, retired or renamed, and no test is deleted or weakened; tests are
added for an exempt 680-line barrel and for mixed files that still fail, the non-string paths
included. `docs/guides/checks.md` states the rule.

## Why

A barrel that only re-exports grows a line with each feature and holds no code. When several
pull requests land in one merge group, the combined `index.ts` goes over 500 lines and the
whole group fails, as it did before #4217 moved export groups out of the two full barrels.
A barrel's length follows the package's public surface, not its logic, and the modules it
re-exports are still measured on their own.

## Covers

- tooling/check/
