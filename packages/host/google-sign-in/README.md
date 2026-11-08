# @halonicjs/host-google-sign-in

Google sign-in for the Google setup flow: the round trip from the auth URL to
the saved refresh token, the PKCE pair and the OAuth `state` for each sign-in,
and revoke for disconnect. Web-standard APIs only, so the same code runs on
Node, Workers and in the browser.

- **Layer:** host
- **Owner:** priya
- **Public API:** `@halonicjs/host-google-sign-in`

## What it gives you

| Export                 | What it does                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `startGoogleSignIn`    | makes the `state` and PKCE pair, keeps them as the account's pending sign-in and returns the auth URL                |
| `finishGoogleSignIn`   | reads Google's callback, exchanges the code, checks the ID token, saves the refresh token and returns a typed result |
| `revokeGoogleSignIn`   | revokes the account's refresh token at Google and removes it from the `TokenStore`                                   |
| `createPendingSignIns` | the server's pending sign-ins, in memory; create one per server and pass it in like a port                           |
| `createPkcePair`       | a new PKCE verifier (32 random bytes, 43 base64url characters) and its S256 challenge (RFC 7636)                     |
| `pkceChallenge`        | the S256 challenge for a verifier                                                                                    |
| `createState`          | a new `state` (32 random bytes, 43 base64url characters)                                                             |
| `stateMatches`         | compares a returned `state` with the expected one in constant time; a missing one never matches                      |

The verifier is a secret. It stays in memory with the pending sign-in and is
sent only to Google's token endpoint; it is never logged, stored or returned
to a caller. The challenge and the `state` go in the auth URL.

No result holds the client secret, the code, the verifier or a token, so
every result is safe to return from a route. A `signedIn` result holds the
e-mail, which is personal data, so log only `kind` and `accountRef`. Keep the
callback route out of request logging, or log its path without the query
string: its URL carries `code` and `state`.

Revoke ends every token of the account under that client ID. If two
integrations ever share a client ID for one account, disconnecting one also
breaks the other. A new sign-in overwrites the old refresh token and never
revokes it, because revoking would end the new token too.

## Example

```ts
import {
  createPendingSignIns,
  finishGoogleSignIn,
  startGoogleSignIn,
} from "@halonicjs/host-google-sign-in";

// Once per server, when the routes are wired:
const pendingSignIns = createPendingSignIns(clock);

// Start (Open again uses pendingSignIns.authUrlFor(accountRef)):
const authUrl = await startGoogleSignIn(
  { accountRef, clientId, clientRef, redirect: { port, path: "/google/callback" }, scopes },
  pendingSignIns,
);

// In the callback route:
const result = await finishGoogleSignIn(callbackUrl.searchParams, {
  pendingSignIns,
  http,
  tokens,
  clock,
  readClientSecret,
});
```

The lower-level parts:

```ts
import { createPkcePair, createState, stateMatches } from "@halonicjs/host-google-sign-in";

const pkce = await createPkcePair();
const state = createState();
// Put pkce.challenge, pkce.method and state in the auth URL; keep pkce.verifier in memory.

// In the callback:
if (!stateMatches(state, callbackUrl.searchParams.get("state"))) {
  // Not this sign-in: change nothing.
}
```

## Requirements

- [`google-sign-in.pkce`](requirements/pkce.md)
- [`google-sign-in.state`](requirements/state.md)
- [`google-sign-in.pending-sign-ins`](requirements/pending-sign-ins.md)
- [`google-sign-in.exchange`](requirements/exchange.md)
- [`google-sign-in.id-token`](requirements/id-token.md)
- [`google-sign-in.revoke`](requirements/revoke.md)
- [`google-sign-in.no-secret-leak`](requirements/no-secret-leak.md)
