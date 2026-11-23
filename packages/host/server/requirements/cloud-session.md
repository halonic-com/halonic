# server.cloud-session

- Status: active
- Since: unreleased
- Source: HAL-13551 (selling layer S2-18), plan approved on the task

`CloudSessionVerifier` shall accept a session token from Halonic Cloud only when every check below passes, and shall answer every refusal the same way, as "not signed in":

- The token is at most 8 KiB, has exactly three parts, and each part is strict base64url; the header and the payload are UTF-8 JSON objects.
- The header's `alg` is exactly `EdDSA` and its `typ` exactly `JWT`, whatever the key says; a header with `crit` is refused.
- The header's `kid` names a key in Cloud's key set whose job is `session` and whose algorithm is Ed25519. A `command` key never verifies a session token, even when its id is in the set.
- The Ed25519 signature over the first two parts verifies with that key.
- `iss` equals the sign-in origin from the deployment's config, `aud` equals the deployment's product id, `session_audience` is `app` and `token_use` is `access`, so a session for Cloud's account pages or for a seller is refused.
- `exp`, `nbf` and `iat` are numbers, and the token hasn't ended, has started and wasn't issued in the future, each with at most 60 seconds of clock skew.
- `sid` is 1 to 128 printable ASCII characters and the revocation list doesn't hold it.

The verifier shall then pass the server's shared claim checks the audience `app`, `sub`, the token's `scope` or, when it has none, `u/` and `sub`, the token's `role`, and `sid`, so the end-user and scope patterns are checked in one place only. The sign-in origin shall be an `https` origin with no path, taken from the deployment's config and never from a request; the verifier shall refuse to be built with any other. When the key set or the revocation list can't answer, the verifier shall throw, so the request fails as a server error and is never treated as signed in or as allowed.

Rationale: the deployment's pages trust whoever Cloud signed in, so every claim that says who, for what and until when must be checked, and an outage of Cloud's lists must never let a token through.

## Examples

- Given a token Cloud signed with its `session` key for this product, then the person is signed in to their own scope.
- Given the same token signed with Cloud's `command` key, then it is refused although the key's id is in the set.
- Given a token whose header says `alg: none` or `ES256`, then it is refused before any key is looked up.
- Given a token for Cloud's account pages (`session_audience` `account`), then it is refused.
- Given a token that ended 61 seconds ago, then it is refused; one that ended 59 seconds ago is accepted.
- Given a session id on the revocation list, then its token is refused; given a list that throws, then the request fails.
