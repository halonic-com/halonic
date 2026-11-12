# The Integration port is at version 2: sign-ins as handles

- **Status:** Accepted
- **Date:** 2026-11-12

## Context

A fenced integration can't declare `tokens`, because `host.tokens` hands it
stored values. So an integration a user builds or changes could use an API
key but not "Sign in with Example". The design on HAL-984 (v0.4, approved by
Liam on HAL-1080 and Julian on HAL-1081) closes that: the sheet declares a
sign-in, Halonic's own code runs it, and the integration can *use* the access
token but never *read* it. That adds a sheet field and a placement form, so
the port version has to say which sheets have them.

## Decision

`integrationVersion` is 2. Version 2 adds the sheet's `signIns`, the
`SignInPlacement` form of a request's `auth` (`AuthPlacement` is the union of
it and `SecretPlacement`), and the `SignInTokens` interface the kit asks for
an access token. `SignInTokens` lives in `integration.ts` and is the kit's,
never part of `IntegrationHost`, so it isn't a port of its own with a version.

The sheet's `kit` says which version it was built against. A sheet with
`signIns` needs `kit: 2` or higher (the sheet check). The loader accepts a
`kit` up to the version this Halonic offers and refuses a newer one, saying
in plain words that the integration needs a newer Halonic. A plugin's `sdk`
follows the same rule. Version 2 only adds, so an integration built for
version 1 loads and runs unchanged; the loader no longer insists on equality.

## Consequences

- An older Halonic reading a version 2 sheet already refuses it: the schema is
  strict, so `signIns` is "unknown key". The new message only explains it.
- The `$id` of the kit's spec files names `v2`.
- A plugin's backend, and an `integration.yaml` read as a plugin, can't declare
  `signIns` yet (`backend-sign-in`): the trust check and the trust content
  don't show a sign-in, so the user couldn't approve one. The Studio pull request
  of HAL-984 lifts it.
- The kit places sign-in tokens, `oauth-sign-in` runs the flow and Studio asks
  for sign-in in later pull requests of HAL-984; until they land, a sheet may
  declare `signIns` but the kit places no token.
