# format.deployments-cloudflare-account

- Status: active
- Since: unreleased
- Source: HAL-17139 (HAL-6702 deploy command; multi-cloud ADR on HAL-35, 5.7)

When `parseFile` reads a `deployments.yaml`, the format shall accept an optional `account` in a deployment's `cloudflare` block, and shall refuse it unless it is exactly 32 lowercase hexadecimal characters, with the message "use the 32-character account id Cloudflare shows, not the account's name".

Rationale: after the first deploy's yes, `halonic deploy` keeps the account's id here, with its name as a comment, so CI and other computers deploy to the same account and aren't asked again (deploy flow HAL-6687, 2.2 and 4). An account id isn't a secret, so the file stays safe to commit. A fork of a public workspace names the original account, which is intended: its first deploy says the token doesn't reach that account and how to change it. Only the id is accepted, because a name can change and two accounts can share one.

## Examples

- Given `cloudflare: { worker: acme, account: 0123456789abcdef0123456789abcdef }` with `# Acme Ltd` after the id, when it is parsed, then the block comes back with that `account`.
- Given a `cloudflare` block without `account`, when it is parsed, then it has no `account` key, as before.
- Given `account: Acme Ltd`, the id in upper case, 31 or 33 characters, or a character that isn't hex, when it is parsed, then it fails with `invalid_format` at `deployments.<id>.cloudflare.account` and the message above.
