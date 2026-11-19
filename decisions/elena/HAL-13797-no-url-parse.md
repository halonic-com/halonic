# Decision: a check rule against web APIs Studio's oldest webviews lack

- Approval: Liam reviews this on HAL-13797, which asks for the guard
- Kind: internal

`pnpm check` gets a new rule, `webview-apis`, in `tooling/check/src/rules/webview-apis.ts` with its tests in
`tooling/check/src/test/webview-apis.test.ts`. It fails `URL.parse` in the Studio app and every workspace package
it depends on, because Studio's oldest webviews (Safari 17.5, Chromium 123) don't have it. The rule parses files
itself, so no trust root under `tooling/check/src/lib/` changes. `rules/layers.ts` only exports its existing
`inPackagePath` helper, and `rules/all.ts` registers the rule. No test is removed, skipped or weakened.

## Covers

- tooling/check/
