# Decision: the loader takes the sign-in tokens the host gives

- Approval: Liam, review of halonic#2489 on HAL-8617
- Kind: internal

## What changes

- `LoadIntegrationOptions` gets an optional `signInTokens`, the access tokens of the sheet's
  sign-ins that the host's `createIntegrationSignIns` provides. The loader passes it on to the
  request builder, so a request that places a sign-in's token carries the token the host gave.
- Without `signInTokens`, a request that places a sign-in's token is refused as `sign-in-needed`
  and nothing is sent.
- One new example in the requirement `integration-kit.loader` states this, with two tests.

## Why

A built-in integration with a sign-in has no other way to get the token into its requests: the
integration must never read the token, so the host gives it to the loader, and the loader places
it. Nothing changes for an integration without a sign-in, or for a caller that doesn't pass the
option.

## Covers

- integration-kit.loader
