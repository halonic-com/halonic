# @halonicjs/host-google-sign-in

Google sign-in for the Google setup flow: the PKCE pair and the OAuth `state`
for each sign-in, made with Web Crypto only, so the same code runs on Node,
Workers and in the browser.

- **Layer:** host
- **Owner:** priya
- **Public API:** `@halonicjs/host-google-sign-in`

## What it gives you

| Export           | What it does                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `createPkcePair` | a new PKCE verifier (32 random bytes, 43 base64url characters) and its S256 challenge (RFC 7636) |
| `pkceChallenge`  | the S256 challenge for a verifier                                                                |
| `createState`    | a new `state` (32 random bytes, 43 base64url characters)                                         |
| `stateMatches`   | compares a returned `state` with the expected one in constant time; a missing one never matches  |

The verifier is a secret. It stays in memory with the pending sign-in and is
sent only to Google's token endpoint; it is never logged, stored or returned
to a caller. The challenge and the `state` go in the auth URL.

The round trip itself (start, finish, revoke) comes in later pull requests
of HAL-699.

## Example

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
