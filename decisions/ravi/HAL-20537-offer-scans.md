# Decision: the leak guard shares its secret rules with Studio's offer scans

- Approval: HAL-18392 (the I6 plan, row 3, approved by the CTO)
- Kind: user-visible

The secret rules move unchanged from `tooling/check/src/leaks/secrets.ts` to
`@halonicjs/std/secret-rules`, so the leak guard and Studio's "Offer to Halonic"
scan run the same rules and can't drift apart.

## What changes

- `tooling/check` imports the rules from `@halonicjs/std/secret-rules`. Only
  `fingerprint` stays in `tooling/check/src/leaks/fingerprint.ts`, because core
  code can't use `node:crypto`.
- `tooling/check/package.json` gets `@halonicjs/std` as a dependency.
- `tooling/check/policy.json` lists `@halonicjs/tooling-check` under
  `toolingUsesCore` and `./secret-rules` under std's `extraExports`.

- The rules stay guarded after the move: `packages/core/std/src/secret-rules.ts`
  joins the guard's own paths (`guardedPaths`, the `check.guard-own-paths`
  requirement and its test) and CODEOWNERS next to `/tooling/check/src/leaks/`.
  A change to it needs a decision note, as it did under `tooling/check/`, so a
  plain `std` pull request can't loosen a rule and switch off part of the leak
  guard. It isn't a trust root: the guard runs from the merge base's copy.

`tooling/check/package.json` and `toolingUsesCore` are trust roots, so this
note needs both guardians' signatures.

## Why

The plan asks for pre-send scans that run the same secret rules as the repo's
leak guard. A copy would drift; a core module both import can't.

## Covers

- .github/
- tooling/check/
- packages/core/std/src/secret-rules.ts
- check.guard-own-paths
