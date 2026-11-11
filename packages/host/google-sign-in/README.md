# @halonicjs/host-google-sign-in

Google sign-in for the Google setup flow: the round trip from the auth URL to
the saved refresh token, the PKCE pair and the OAuth `state` for each sign-in,
and revoke for disconnect. Web-standard APIs only, so the same code runs on
Node, Workers and in the browser.

- **Layer:** host
- **Owner:** priya
- **Public API:** `@halonicjs/host-google-sign-in`

## What it gives you

| Export                     | What it does                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `startGoogleSignIn`        | makes the `state` and PKCE pair, keeps them as the account's pending sign-in and returns the auth URL                                                         |
| `finishGoogleSignIn`       | reads Google's callback, exchanges the code, checks the ID token and the account, saves the refresh token, checks each service and returns a typed result     |
| `checkGoogleServicesAgain` | refreshes the access token with the saved refresh token and checks each service again, for "Check again"                                                      |
| `revokeGoogleSignIn`       | revokes the account's refresh token at Google and removes it from the `TokenStore`, whether or not Google confirms                                            |
| `googleRevokeEndpoint`     | Google's revoke endpoint URL, as a constant                                                                                                                   |
| `createPendingSignIns`     | the server's pending sign-ins, in memory, at most one per account; one older than 10 minutes counts as none. Create one per server and pass it in like a port |
| `createPkcePair`           | a new PKCE verifier (32 random bytes, 43 base64url characters) and its S256 challenge (RFC 7636)                                                              |
| `pkceChallenge`            | the S256 challenge for a verifier                                                                                                                             |
| `createState`              | a new `state` (32 random bytes, 43 base64url characters)                                                                                                      |
| `stateMatches`             | compares a returned `state` with the expected one in constant time; a missing one never matches                                                               |

The verifier is a secret. It stays in memory with the pending sign-in and is
sent only to Google's token endpoint; it is never logged, stored or returned
to a caller. The challenge and the `state` go in the auth URL.

No result holds the client secret, the code, the verifier or a token, so
every result is safe to return from a route. A `signedIn` or `wrongAccount`
result holds an e-mail, which is personal data, so log only `kind` and
`accountRef`. Keep the
callback route out of request logging, or log its path without the query
string: its URL carries `code` and `state`.

Every request to Google's token endpoint (the code exchange and the refresh)
and to the revoke endpoint refuses redirects, because one would send the
secrets or the refresh token to another address, and gives up after 10
seconds. For the exchange and the refresh a stalled answer counts as
`unreachable`; a disconnect still removes the saved token and says in its
result that Google didn't confirm.

Revoke ends every token of the account under that client ID. If two
integrations ever share a client ID for one account, disconnecting one also
breaks the other. A new sign-in overwrites the old refresh token and never
revokes it, because revoking would end the new token too.

## Checks after sign-in

`finishGoogleSignIn` runs setup items 6 and 7 before it returns, so before
any integration code runs:

1. **Account.** The ID token's verified e-mail must be the connector's
   address (`account` at start, compared without regard to case). For another
   account the result is `wrongAccount` and nothing is saved. When Google has
   not verified the e-mail, the result is `idTokenRefused`, even for the
   connector's own address. Nothing is revoked either: that
   address may be another connector on the same client.
2. **Save** the refresh token.
3. **Each service, in order.** `scopeNotGranted` when the user unticked one
   of its scopes, `allowed` when its sheet has no `googleCheck`, and otherwise
   one `GET` to the check with the fresh access token: `works`, `apiOff`,
   `checkFailed` or `unreachable`.

The access token goes only into the check's `Authorization` header. A check
URL must be `https` on one of the service's own `googleApis` hosts (not
`storage.googleapis.com`) or on `www.googleapis.com`, Google's shared API
host, with a path that starts with the name of one of the service's APIs (no
user name, password or other port); `startGoogleSignIn` refuses any other with a `RangeError`, before
the user goes to Google. A check follows no redirect and gives up after 10 seconds.

## Check again

`checkGoogleServicesAgain` runs the same checks later, from the setup record,
for step 7's "Check again" button. It refreshes the access token with the
saved refresh token and checks each service as above; the access token never
leaves it either.

- While the record holds a refused refresh, it returns `refreshBlocked` and
  sends nothing, so a refused refresh is never retried in a loop.
- A refused refresh comes back as `readRefreshAnswer` reads it
  (`signInRefused`, `clientRefused`, …). The saved refresh token stays; the
  caller marks the record.
- If Google sends a new refresh token, it replaces the saved one.

## Example

Starts a sign-in for a made-up client, prints the auth URL's parameters and
shows `stateMatches` refusing a wrong `state`. Nothing goes over the network.
This example is [`examples/start-sign-in.ts`](examples/start-sign-in.ts),
which `src/example.test.ts` runs and checks.

```ts
import * as signIn from "@halonicjs/host-google-sign-in";

/** The parameters whose value is random on every sign-in, so the example prints only their length. */
const randomParameters = new Set(["state", "code_challenge"]);

/** Starts a sign-in for a made-up client and prints the auth URL's parameters. No network, no real IDs. */
export async function runExample(): Promise<string[]> {
  // Once per server. It holds the state and the PKCE verifier of each sign-in in memory.
  const pendingSignIns = signIn.createPendingSignIns({ now: () => new Date() });

  const authUrl = await signIn.startGoogleSignIn(
    {
      accountRef: "acme_clerk",
      clientId: "123456789-acme.apps.example.test",
      clientRef: "acme_client",
      redirect: { port: 8787, path: "/google/callback" },
      account: "clerk@acme.example", // the connector's address, used as the login hint
      services: [
        {
          id: "gmail",
          label: "Gmail",
          googleApis: [{ api: "gmail.googleapis.com", name: "Gmail API" }],
          googleScopes: [
            { scope: "https://www.googleapis.com/auth/gmail.readonly", reason: "Reads your mail" },
          ],
        },
      ],
    },
    pendingSignIns,
  );

  // Nothing was sent: the URL is what the browser opens. Print its parameters, hiding the random ones.
  const url = new URL(authUrl);
  const lines = [`${url.origin}${url.pathname}`];
  for (const [name, value] of url.searchParams) {
    lines.push(
      `  ${name}: ${randomParameters.has(name) ? `<${value.length} random characters>` : value}`,
    );
  }

  // The callback must carry the state from the URL. Anything else, or none, is refused.
  const state = url.searchParams.get("state") ?? "";
  lines.push(
    `callback with the URL's state: ${signIn.stateMatches(state, state) ? "accepted" : "refused"}`,
  );
  lines.push(
    `callback with another state: ${signIn.stateMatches(state, "forged-state") ? "accepted" : "refused"}`,
  );
  lines.push(
    `callback with no state: ${signIn.stateMatches(state, null) ? "accepted" : "refused"}`,
  );
  return lines;
}
```

`finishGoogleSignIn` is the other half, called from the callback route:

```ts
import { finishGoogleSignIn } from "@halonicjs/host-google-sign-in";

// In the callback route, with the same `pendingSignIns` as at the start:
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
- [`google-sign-in.account-check`](requirements/account-check.md)
- [`google-sign-in.service-checks`](requirements/service-checks.md)
- [`google-sign-in.check-request`](requirements/check-request.md)
- [`google-sign-in.check-again`](requirements/check-again.md)
