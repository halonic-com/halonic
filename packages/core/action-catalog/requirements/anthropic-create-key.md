# action-catalog.anthropic-create-key

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 7.1 and 7.8; task HAL-17553, scope from Liam's answer on HAL-20273

When a request names `anthropic.create-key@1` with a `keyName`, the action-catalog package shall offer one `guided` step of risk `admin` that opens `https://console.anthropic.com/settings/keys` with numbered instructions for creating the key there and copying it for the stepper's next step, and the definition shall have no parameter, `input` step, guided `result` or kept field that can carry the key's value.

The manual guide of `anthropic.create-key@1`, built by the stepper's own manual guide from the same definition, shall be a numbered list that names that page and holds no field for a value.

## Examples

- Given the parameters `{ keyName: "acme-agents" }`,
  when the manual guide is built,
  then its first numbered line is `1. Open https://console.anthropic.com/settings/keys`.
- Given those parameters with an extra `value`, `secret`, `key` or `token`,
  when they are parsed,
  then they are refused.
