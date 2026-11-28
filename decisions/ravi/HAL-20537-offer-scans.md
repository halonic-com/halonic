# Decision: the leak guard shares its secret rules with Studio's offer scans

- Approval: HAL-18392 (the I6 plan, row 3, approved by the CTO)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ChFp+i13/eaAXnlm8Bom7G6pAFZ6R02HOakq5lDbwfVLEkDW9UP17imR0a51+c4+kzhuxtBX+NolHAJD2cy+BA==
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:OK/hWuOIziHL1v/CcvdnBZ5OwNl5MlZj2syFE6eKfr34b8/AO4D9lyqdaaSrZj4UqKSN/mOs3Xlq5kKa+WWVAQ==

The secret rules move unchanged from `tooling/check/src/leaks/secrets.ts` to
`packages/core/std/src/secret-rules.ts`, so the leak guard and Studio's "Offer
to Halonic" scan run the same rules and can't drift apart.

## What changes

- Studio imports the rules as `@halonicjs/std/secret-rules` (a new entry in
  std's `extraExports`).
- The leak guard imports the same file by relative path. CI runs it on plain
  Node with nothing installed, so it can't resolve a package name. The `layers`
  rule allows exactly this one import out of `tooling/check/src/leaks/`, and
  `leaks-imports.test.ts` fails if any file `leaks.ts` loads imports anything
  but a relative path or a `node:` module. `tooling/check/package.json` and
  `toolingUsesCore` stay as they are.
- `turbo.json` lists `packages/core/std/src/secret-rules.ts` as an input of
  `//#codegen`, because the leak guard now reads it from there.
- Only `fingerprint` stays in `tooling/check/src/leaks/fingerprint.ts`,
  because core code can't use `node:crypto`.
- The rules stay guarded after the move: `packages/core/std/src/secret-rules.ts`
  joins the guard's own paths (`guardedPaths`, the `check.guard-own-paths`
  requirement and its test) and CODEOWNERS next to `/tooling/check/src/leaks/`.
  A change to it needs a decision note, as it did under `tooling/check/`, so a
  plain `std` pull request can't loosen a rule and switch off part of the leak
  guard. It isn't a trust root: the guard runs from the merge base's copy.

`tooling/check/src/guard/guarded-paths.ts` is a trust root, so this note needs
both guardians' signatures.

## Why

The plan asks for pre-send scans that run the same secret rules as the repo's
leak guard. A copy would drift; one file both import can't.

## Covers

- .github/
- tooling/check/
- tooling/check/policy.json
- packages/core/std/src/secret-rules.ts
- turbo.json
- check.guard-own-paths
