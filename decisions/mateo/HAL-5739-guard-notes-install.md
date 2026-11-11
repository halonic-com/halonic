# Decision: the Guard notes job installs the check's own dependencies

- Approval: Mateo fixed it on [HAL-5739](/HAL/issues/HAL-5739); Liam reviewed the pull request on [HAL-5742](/HAL/issues/HAL-5742) and signs this note
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:6Kz3VS2eXTpTIzLCm1JWXfYlrTY/KpHn0HHFZWvbQkWcnPPF9kyOd84cX/0/PLL4TOG08ZCtSWj4wk7BkOsTBg==
- Task: HAL-5739

## What changes

`guard-notes.yml` runs one install before the check:
`pnpm install --frozen-lockfile --ignore-scripts --filter "@halonicjs/tooling-check..."`.
It installs only `@halonicjs/tooling-check` and what it depends on, from the base branch's
lockfile, with no install scripts, no cache, no secret and the same read-only token. The
pull request's code is still never checked out or run: the install happens in the base
branch's checkout.

## Why

Since #1757, `guard/signatures.ts` imports `lib/source-files.ts`, which uses the TypeScript
compiler API from `@typescript/typescript6`. The job ran with no install, so the check failed
with `ERR_MODULE_NOT_FOUND` on every pull request and merge-queue run, and checked no note at all.

## Covers

- .github/
