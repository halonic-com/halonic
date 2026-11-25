# Decision: a stepper definition's source hash covers the shared files it imports

- Approval: HAL-18198 (Liam's [minor] finding on #5903, HAL-17561) asks that changing what a definition accepts, through any file it depends on, changes its `sourceHash` or fails a check. Option 1 of that task, since option 2 (no shared files) no longer fits the catalog on `main`. It changes `tooling/check/` and a requirement, so Liam signs
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:4MRMmCQS0xpUh1UYUVAmrK6GfbSTGrgzHX9/BZHpaiFOjvTTQWWucuqWUPzxCwxyiaeZmIDBNQbygfPdNSoDDg==

## What changes

The `catalog-hashes` rule and `pnpm discover --fix` now hash each `src/<group>/<name>.ts` together with every file it
reaches through relative imports (`from`, `import` and `import()` with a `./` or `../` path), the definition first and
the others sorted by path. Each file adds its path in the package, its length in bytes and its bytes, so moving bytes
from one file to the next still changes the hash. A change to `src/github-parameters.ts`, `src/npm-parameters.ts`,
`src/google-parameters.ts` or `src/device-check.ts` now changes the hash of every definition that uses it, and
`pnpm check` fails until `pnpm discover --fix` is run.

Every hash in `packages/core/action-catalog/src/catalog.generated.ts` changes once. The definitions are unreleased v1,
so no stored record holds an old hash.

The requirement `check.catalog-hashes` now says "and of every file it reaches through relative imports" and gains an
example for a changed shared file. The rule only adds failures; it allows nothing that was refused before.

## Tests

No test is weakened or skipped. `tooling/check/src/test/catalog-hashes.test.ts` adds a changed shared file, a changed
file reached through another import, and the file order and moved-bytes case; the empty catalog's expected header line
is reworded to match. `packages/core/action-catalog/src/catalog.test.ts` now checks the hash of
`github.upload-social-preview@1` over its file and `src/github-parameters.ts`, instead of its file alone.

## Covers

- check.catalog-hashes
- tooling/check/
- packages/core/action-catalog/src/catalog.test.ts
