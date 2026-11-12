# check.live-probe

- Status: active
- Since: 0.1.0
- Source: HAL-7483

When the live suites run, the account probe shall check that `GET /accounts` lists the CI account with a name, that the token verifies as active on the endpoint for its kind (`cfat_` on `/accounts/{id}/tokens/verify`, `cfut_` on `/user/tokens/verify`), and that listing Workers scripts, D1 databases and R2 buckets succeeds. It shall mark the other token kind, and the checks that need a bare free account (HAL-6806), as skipped. It shall fail when any check fails, and it shall never print the token, the account ID or the account's name, not even when a Cloudflare error or a thrown error repeats the request path (ADR 5.9, HAL-6804, HAL-7505). It shall give up on a request that takes longer than 20 seconds, the body read included, and fail that check with a plain message instead of hanging (HAL-7505).

## Examples

- Given a `cfat_` token, the account in the list and every read answering 200, then the probe passes, verifies on `/accounts/{id}/tokens/verify` and skips `/user/tokens/verify`.
- Given a `cfut_` token, then it verifies on `/user/tokens/verify` and skips the account endpoint.
- Given an R2 list answering 403, then the probe fails and names HTTP 403 and Cloudflare's error code.
- Given a token with neither prefix, then the probe fails.
- Given a 403 whose message repeats `/accounts/{id}/d1/database` with the real account ID, then the detail shows `/accounts/<account-id>/d1/database` and the ID appears nowhere in the results.
- Given a request whose headers arrive but whose body never finishes, then the check fails after 20 seconds with "the request timed out after 20 s." and the probe goes on to the next check.
