# deploy.credentials

- Status: active
- Since: 0.1.0
- Source: HAL-6704, HAL-6804; build plan 3a (HAL-198)

The deploy shall accept a `cfut_` user token, a `cfat_` account token and a legacy token. It shall find the account with `GET /accounts`, verify a `cfat_` token at the account endpoint and any other token at the user endpoint (a legacy token whose user check fails is tried at the account endpoint), and call no other `/user/*` or `/memberships` endpoint. It shall stop with a typed error when the token is inactive or the account is missing or ambiguous, and no error or message shall contain the token.

Rationale: a deploy needs the least access that works, and a token pasted into a terminal must not come back out in a log or an issue.

## Examples

- Given a `cfat_` token, then it is verified at `/accounts/{id}/tokens/verify` and never at `/user/tokens/verify`.
- Given a legacy token whose user check fails, then the account endpoint decides.
- Given a token that sees two accounts and no account named, then the deploy stops with `ambiguous-account` and lists both.
- Given Cloudflare echoes the token in an error body, then the error message shows `[redacted]` in its place.
