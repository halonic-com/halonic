# @halonicjs/host-integration-sign-in

The host's side of an integration's sign-ins. It fills each sign-in in from the
integration's permission sheet and settings with `approvedSignIns`, gives the
kit the tokens it asks for (`createSignInTokens` of `@halonicjs/oauth-sign-in`),
and signs out without a refresh in flight undoing it.

- **Layer:** host
- **Owner:** ravi
- **Public API:** `@halonicjs/host-integration-sign-in`

## What it gives you

| Export | What it does |
| --- | --- |
| `createIntegrationSignIns` | one integration's sign-ins: `tokens` for the kit, `lookUp` and `signOut` for Halonic's own side. The sheet and the settings are read through `current()` each time, so a changed setting or an updated sheet counts at once |
| `IntegrationSignIns.lookUp` | the sign-in with every setting filled in (`approvable`), `unknown`, or `settingsInvalid` with the problems; for the trust check and the start of a sign-in |
| `IntegrationSignIns.tokens` | the kit's `SignInTokens`. Only `access`, `rejected` and `filterValues`: forgetting a token is Halonic's side only. Gives nothing while the sign-in is being signed out |
| `IntegrationSignIns.signOut` | waits for a refresh in flight, revokes at the address the user approved, removes the grant and drops the access token in use |

The grant store, the `HttpClient` (https only, no redirects), the secrets and the
clock are passed in like ports.
