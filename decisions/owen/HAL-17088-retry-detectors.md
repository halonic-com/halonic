# Decision: a new core package for the retry detectors

- Approval: Liam approves the new package on HAL-17088 (step 1 of HAL-17073, the retry policy service). It changes `tooling/check/policy.json`, a trust root, so both guardians sign: Julian, then Liam
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:IISzTfQ9yhJhi4VFXaKHr1JhfzKvjCaoRuiaQZidhODJkNusIdJHvdM9FAktmIJ0uhIkz2OQjRCaRqOEaoo6Ag==
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:i3PYO2FdPE7y8Zjq+Uc1HQr1k0WM3MBNv/f+5Il/2Od4eFAUSUt/u22olnVUQoOTBxBrpjw5dgWWHxLece03BA==

## What changes

A new core package, `@halonicjs/retry-detectors`, scores a writer attempt's chance of failing
without a model call: once at the end of the run and at minute 3 while it runs. `pnpm new package`
added `@halonicjs/retry-detectors` at the end of `coreOrder` in `tooling/check/policy.json`. The
package depends on no other core package, so its place in the order doesn't matter yet. Nothing
else in the guard changes.

## Tests

No test is weakened. The package's own tests check the TypeScript port against the scores the
Python model gave the export's sample attempts, under the new requirements
`retry-detectors.end-of-run`, `retry-detectors.in-run` and `retry-detectors.calibration`.

## Covers

- tooling/check/
