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

- `loopbackRedirectUri`: the redirect URI the sign-in sends the provider
  (`http://127.0.0.1:<port><path>`, never a query string or fragment).

That is all for now. The package lands with its `coreOrder` entry and this one
function so that the entry is in the base commit before any code uses it (the
`Policy rules` job reads `policy.json` from the base; see
`docs/guides/checks.md`). The rest of the sign-in flow moves in from
`@halonicjs/google-setup` in the next pull request (HAL-8323).
