# @halonicjs/adapter-password-scrypt

Owner: elena · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The PasswordHasher port with scrypt (`@noble/hashes`), the format `serve` uses.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/adapter-password-scrypt -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- The format and its limits are `ports.password-hash-format` (ln 14 to 15, r 8, p 5 to 16).
  Don't change a limit or the settings here without a decision and Julian's review: a looser check
  lets a weak or tampered hash in.
- No `node:*`. `@noble/hashes` is the only outside library, here and nowhere else (it is listed in `tooling/check/dependencies.json`).
