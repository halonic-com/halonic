# server.session-credential

- Status: active
- Since: unreleased
- Source: HAL-13213; selling layer design (HAL-12483), sections 3.1 and 14.1; threat model (HAL-13208)

The server shall read a session token only from the request's headers: the session cookie or an `Authorization: Bearer` header, never from the address, so a token in a query string shall be ignored. The server shall refuse a request that carries both a session cookie and an `Authorization` header, two session cookies, an empty session cookie, or an `Authorization` header that isn't one well-formed bearer token. The server shall pass the token to the `SessionVerifier` port, which checks the signature, expiry and revocation, and shall then run the shared principal check on the claims the verifier returns, whichever verifier it is. A verifier shall never trust a header or a claim it hasn't verified. When the verifier throws an error, the server shall treat it as a server error, never as a refusal.

Rationale: a query string ends up in logs and browser history, and one request must never mix two credentials or let a verifier skip the scope and role rules.

## Examples

- Given a valid token only in `?access_token=`, then the request counts as not signed in.
- Given a valid cookie and a token in the query string, then only the cookie is read.
- Given a valid bearer token, then the result is the same principal as for the same token in the cookie.
- Given a verifier that returns claims with the wrong audience, then the request is refused.
- Given a verifier whose key store is down and that throws, then the error goes up as a server error.
