# @halonicjs/testing-sign-in

A fake OAuth server and the attack tests T1 to T22 for sign-ins (HAL-984 design, section 8). The fake server is
a provider in memory: an authorize step, a token endpoint, a revoke endpoint and a resource API, strict where a
real provider is strict (PKCE, single-use codes, client authentication, optional refresh token rotation with reuse
detection) and hostile on request.

- **Layer:** testing
- **Owner:** julian
- **Public API:** `@halonicjs/testing-sign-in`

## What is in it

- `createFakeOAuthServer`: the provider. It is an `HttpClient`, so it stands where the host's client and the kit's
  transport go, and it records every request. `behavior` makes it hostile: it can echo tokens, redirect the token
  endpoint, rotate refresh tokens, answer with bad token types, bad sizes or no JSON, and hold token answers so
  requests overlap. `handle(host, …)` takes over a host, such as a resource server that echoes the token.
- `createSignInRig`: the host's real sign-in flow and tokens and the kit's real loader, wired to the fake server,
  with a clock a test moves. `rig.signIn()` runs a whole sign-in; `rig.api()` sends a request through the kit
  with the sign-in's token placed.
- `followingRedirects`: a client that follows redirects as `fetch` does, to show the sign-in code refuses one
  even when the client below would follow it.

## Example

Run a sign-in against a provider that answers with a token type that isn't bearer, and see that nothing is saved:

```ts
const rig = createSignInRig();
rig.server.behavior.answerFields = { token_type: "mac" };
const { outcome } = await rig.signIn();
// outcome.kind is "tokenAnswerRefused", and rig.store is empty.
```

Every value in the tests is fake, and every address is on `example.com`.
