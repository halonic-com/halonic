# format.integration-sign-ins

- Status: active
- Since: 0.2.0
- Source: HAL-984 design (`HAL-984#document-design`, sections 2, 3 and 9), approved by Liam on HAL-1080 and Julian on HAL-1081; HAL-7889 (pull request 1)

The permission sheet shall accept a top-level `signIns`: a sign-in name, then its `purpose`, `flow: oauth-code`, `authorizeUrl`, `tokenUrl`, optional `revokeUrl` and `issuer`, `clientId`, optional `clientSecret`, `clientAuth` (`post` by default, or `basic`), `scopes` and `access` (its `hosts`, and `as: bearer` or `as: header` with `header` and `prefix`; never `form`). Each URL shall be `https` with an exact host, or `{ fromSetting, path }`, whose setting must be a `public` host in `hosts`. The sheet check shall refuse: `signIns` with a `kit` below 2 (`sign-ins-need-kit-2`); an access host not in `hosts` (`sign-in-host-not-declared`); a query on a `tokenUrl`, `revokeUrl` or `issuer` (`sign-in-url-query`); an `authorizeUrl` that sets `client_id`, `redirect_uri`, `state`, `code_challenge`, `code_challenge_method`, `response_type` or `scope`, however it is cased or percent-encoded (`sign-in-reserved-parameter`); a `{ fromSetting }` URL whose setting isn't a `public` host in `hosts` (`sign-in-setting-not-public`); and a client secret that isn't declared (`client-secret-not-declared`), that has `hosts` or `as` (`client-secret-has-hosts`), that two sign-ins name (`client-secret-shared`), or that no sign-in names (`client-secret-unused`). A client secret is a `secrets` entry with only a `purpose`. `integrationPolicy` shall resolve each sign-in to its access hosts and placement, and its client secret to the hosts of the sign-in's `tokenUrl` and `revokeUrl` and no others.

## Examples

- Given the Example sign-in of the design (`kit: 2`, a client secret `example-client`, access to `api.example.com` as a bearer token), when it is parsed, then it passes with `clientAuth: post`.
- Given the same sheet with `kit: 1`, when it is checked, then it fails with `sign-ins-need-kit-2` at `kit`.
- Given `access: { hosts: [other.example.com], as: form }`, when it is parsed, then it fails: there is no `form` placement for a token.
- Given `access.hosts` with `other.example.com`, which `hosts` doesn't list, when it is checked, then it fails with `sign-in-host-not-declared`.
- Given an `authorizeUrl` of `https://auth.example.com/authorize?audience=api`, when it is checked, then it passes; with `?redirect_uri=x`, `?State=x` or `?%63lient_id=x`, it fails with `sign-in-reserved-parameter`.
- Given a `tokenUrl` of `http://auth.example.com/token`, or `https://auth.example.com/token?x=1`, when it is checked, then it fails.
- Given a `tokenUrl` of `{ fromSetting: gitlab, path: /oauth/token }` and `hosts` with `{ fromSetting: gitlab, class: public }`, when it is checked, then it passes; with class `private`, it fails with `sign-in-setting-not-public`.
- Given a client secret that has `hosts`, that no sign-in names, or that two sign-ins name, when it is checked, then it fails with `client-secret-has-hosts`, `client-secret-unused` or `client-secret-shared`.
- Given the Example sign-in with a `tokenUrl` on `auth.example.com` and a `revokeUrl` on `revoke.example.com`, when the policy is resolved, then its client secret may go to those two hosts only, and the access token to `api.example.com`.
- Given a `{ fromSetting: gitlab }` token URL and `gitlab` set to `https://git.example.com`, when the policy is resolved, then the client secret's host is `git.example.com`.
