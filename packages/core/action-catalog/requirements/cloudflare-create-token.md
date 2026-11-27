# action-catalog.cloudflare-create-token

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 7.1 and 7.8; task HAL-17553, scope from Liam's answer on HAL-20273

When a request names `cloudflare.create-token@1` with a `keyName`, a `zone` and one `permission` of `DNS · Edit`, `DNS · Read`, `Email Routing Rules · Edit` or `Zone Settings · Edit`, the action-catalog package shall offer one `guided` step of risk `admin` that opens `https://dash.cloudflare.com/profile/api-tokens` with numbered instructions for creating the key there and copying it for the stepper's next step, and the definition shall have no parameter, `input` step, guided `result` or kept field that can carry the key's value.

The manual guide of `cloudflare.create-token@1`, built by the stepper's own manual guide from the same definition, shall be a numbered list that names that page and holds no field for a value.

## Examples

- Given the parameters `{ keyName: "acme-dns", zone: "acme.example", permission: "DNS · Edit" }`,
  when the manual guide is built,
  then its first numbered line is `1. Open https://dash.cloudflare.com/profile/api-tokens`, with instructions that scope the token to that one permission on that one zone.
- Given those parameters with an extra `value`, `secret`, `key` or `token`,
  when they are parsed,
  then they are refused.
