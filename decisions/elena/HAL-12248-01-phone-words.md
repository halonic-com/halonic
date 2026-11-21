# Decision: the Remote feature package gets a `./phone` entry point for the phone's screens

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15151 (Liam decided the phone screens live in `@halonicjs/studio-feature-remote` under `src/phone/`); the package owner's reviewer (Liam) approves this note in review
- Kind: internal
- Task: HAL-12248

## What changes

`tooling/check/policy.json` lists `./phone` under `extraExports` for `@halonicjs/studio-feature-remote`,
and the package's `exports` gain `"./phone": "./src/phone/index.ts"`. The new entry point holds only
the phone's code: the time and count forms (`remote.phone-forms`) and the six-state status label
(`remote.phone-status`). Nothing existing is removed or weakened.

## Why

The phone app builds only the phone's screens and must not pull in the desktop shell. A separate entry
point keeps that boundary visible, and `phone-boundary.test.ts` fails if anything under `src/phone/`
imports the desktop shell.

## Covers

- tooling/check/policy.json
