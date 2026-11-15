# server.secrets-refusals

- Status: active
- Since: 0.1.0
- Source: HAL-1292 (T4, PR 4a); security rules of `server.google-secret`

The server shall check a request to `/api/secrets/<name>` in this order, and answer the first refusal with a fixed error and `Cache-Control: no-store`, before anything is saved, removed or parsed: no `providerKeys` store (404 `keys_not_supported`); a `Sec-Fetch-Site` other than `same-origin` (403 `secret_from_other_site`); a name that breaks the name rule, is empty, has more than one path segment or an encoded `/`, or belongs to Halonic (`serve-password`, `token-key`, a `halonic_token_` name) or a plugin (`plugin__`), compared in `secretKey` form (400 `secret_name_refused`); on `PUT`, a content type other than `application/json` (415 `json_required`); on `PUT`, a connection that is neither HTTPS nor addressed to a loopback name (403 `secure_connection_required`); on `PUT`, a body that `server.secrets-write` refuses (400 `secret_not_accepted`). A request with no `Sec-Fetch-Site` header passes that check, like the Android app and scripts. The name rule covers `GET` and `DELETE` too. An unknown verb shall answer 404 `not_found`.

Rationale: every check up to the body uses only the URL and the headers, so a refused request is never parsed, and a refusal never says why in more words than its code.

## Examples

- Given a `PUT` that is both cross-site and not JSON, then the answer is 403 `secret_from_other_site`.
- Given `GET /api/secrets/serve-password`, then the answer is 400 `secret_name_refused`, so the route doesn't say whether a password is set.
- Given a `PUT` over plain http to a LAN name, then the answer is 403 `secure_connection_required`, whatever the body says.
- Given a `PUT` with no `Sec-Fetch-Site` header, over HTTPS, then it is accepted.
