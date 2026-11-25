# Decision: the plugin runtime may send read-only GraphQL queries to GitHub

- Approval: Liam chose option A on HAL-18230 (a `github.merge-queue` handler in the runtime), scoped on HAL-18231; this is a security pull request, reviewed by Liam with Julian signing security, and Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:oQlZK8Zgfl2YFOVJls6Sc76R9ChlezIAZP2OEvgu3Lx7zN/m2uM+BUFnENPpL77H75QVRGBapwSgdIC4mUArBQ==

`runtime.tools` said the runtime reads GitHub only by GET requests to
api.github.com. The merge queue exists only in GitHub's GraphQL API, and
GraphQL takes even a read as a POST, so `github.merge-queue` can't be served
under that wording. The requirement now also allows a GraphQL document that
is a single `query`, posted to api.github.com/graphql with the same read
token, never following a redirect. The query reader refuses a mutation or a
subscription before anything is sent, and a new example and test hold it to
that. No new token, scope or host: the token still goes only to
api.github.com, and nothing the requirement checked before is dropped.

## Covers

- runtime.tools
