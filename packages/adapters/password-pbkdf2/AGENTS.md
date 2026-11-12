# @halonicjs/adapter-password-pbkdf2

Owner: priya · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The PasswordHasher port with chained PBKDF2-SHA256 from Web Crypto, for cloud targets: the deploy step makes the hash, the Worker checks it.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/adapter-password-pbkdf2 -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- The format and its limits are Julian's HAL-136 decision and `ports.password-hash-format-pbkdf2-chain`.
  Don't change a limit, the rounds or the construction here without a new decision on HAL-136 and
  Julian's review: a looser check lets a weak or tampered hash in.
- Web Crypto only. No `node:*`, no outside hashing library: this code runs in the Worker bundle.
