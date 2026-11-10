# @halonicjs/std

Owner: maya · Layer: core · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

In-house utilities that replace generic libraries: result type, ids, clock, UTF-8, base64url, text helpers, deep equality and clone, posix paths, constant-time comparison, a typed event emitter, error kinds, a per-key work queue and semver versions.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                       | What it does                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify`                                 | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/std` | runs only this package's tests (and the codegen they need)                           |

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
