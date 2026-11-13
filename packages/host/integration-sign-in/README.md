# @halonicjs/host-integration-sign-in

The host's side of an integration's sign-ins. It fills each sign-in in from the
integration's permission sheet and settings with `approvedSignIns`, gives the
kit the tokens it asks for (`createSignInTokens` of `@halonicjs/oauth-sign-in`),
signs out without a refresh in flight undoing it, and runs the sign-in itself: the start and the callback.

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

| `createSignInFlow` | starts a sign-in and answers its callback. `start` builds the authorize URL (`state`, the PKCE challenge and the redirect to a new random path on `127.0.0.1` are set by Halonic, whatever the sheet says) and keeps the sign-in pending; `handleCallback` is the `Request → Response` handler for the callback path: a path that isn't pending gets a plain 400, `iss` is checked, the sheet is looked at again and must still be the one that started, and the exchange uses the sign-in as it was then. Only the refresh token is kept. The page repeats nothing the request carried; `onOutcome` tells the app how it ended |

The grant store, the `HttpClient` (https only, no redirects), the secrets and the
clock are passed in like ports.
