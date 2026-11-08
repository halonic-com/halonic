# @halonicjs/host-google-sign-in

Owner: priya · Layer: host · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

Google sign-in for the setup flow: PKCE, state and the OAuth round trip, on Web-standard APIs only.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                                       | What it does                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify`                                                 | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/host-google-sign-in` | runs only this package's tests (and the codegen they need)                           |

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
