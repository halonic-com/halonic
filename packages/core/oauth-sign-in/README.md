# @halonicjs/oauth-sign-in

An OAuth 2.0 sign-in with PKCE and a loopback redirect: the rules (what a
pending sign-in holds, how a callback is read, what a token answer means, how
the redirect URI is built) and the flow's requests (the PKCE pair and `state`,
the server's pending sign-ins and the token request that exchanges the code).
It is a core package, so it uses ports only: the platform's randomness,
SHA-256 and timeout come from the host that calls it (the `RandomBytes` and
`Digest` ports and an `AbortSignal`). Google's sign-in (`@halonicjs/google-setup`,
`@halonicjs/host-google-sign-in`) is one user, with its own steps on top.

- **Layer:** core
- **Owner:** ravi
- **Public API:** `@halonicjs/oauth-sign-in`

## What it gives you

| Export | What it does |
| --- | --- |
| `PendingSignInDetails`, `PendingSignIn`, `PendingSignIns` | what a sign-in keeps while the browser is at the provider, and the server's holder of them. A provider extends the details with what its own steps need |
| `pendingSignInLifetimeMs`, `hasPendingSignInExpired` | a pending sign-in expires 10 minutes after its start |
| `readSignInCallback` | reads the callback: finds the pending sign-in by `state` first, and only then reads `error` or `code`. `access_denied` is `cancelled`; a provider names its own error codes through a table |
| `classifyTokenAnswer` | says what the answer to the code exchange means, never reading `error_description`. The refresh token, the ID token and the scopes are optional (RFC 6749); a provider that needs them checks that itself |
| `loopbackRedirectUri` | `http://127.0.0.1:<port><path>`, refusing any path that could carry a query string or fragment |
| `safeOAuthErrorCode` | keeps an error code only when it is a plain snake_case word |
| `createPendingSignIns` | the server's pending sign-ins, in memory, at most one per account; one older than 10 minutes counts as none. Create one per server and pass it in like a port |
| `createPkcePair`, `pkceChallenge` | a new PKCE verifier (32 random bytes, 43 base64url characters) and its S256 challenge (RFC 7636); the challenge for a verifier. They take the `RandomBytes` and `Digest` ports |
| `createState`, `stateMatches` | a new `state` from the `RandomBytes` port (32 bytes, 43 base64url characters); compares a returned `state` with the expected one in constant time, and a missing one never matches |
| `exchangeAuthorizationCode` | sends the code, the client, the redirect URI and the verifier to a token endpoint |
| `postTokenForm`, `formBody` | sends one form to a token endpoint: refuses redirects, stops when the caller's signal aborts (`tokenRequestTimeoutMs` is the limit it should have) and drops the `HttpClient`'s error, which can carry the request; writes a form body |

The caller gives the token endpoint, from the sign-in's own settings. It is
never taken from a callback.

Nothing here names a provider. Google's error names (`admin_policy_enforced`,
`org_internal`) and its demand for an ID token stay in `@halonicjs/google-setup`.
