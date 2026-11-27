# action-catalog.google-create-credential

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 7.1 and 7.8; task HAL-17553, scope from Liam's answer on HAL-20273

When a request names `google.create-credential@1` with a Google Cloud `projectId` and a `keyName`, the action-catalog package shall offer one `guided` step of risk `admin` that opens `https://console.cloud.google.com/apis/credentials` with numbered instructions for creating the key there and copying it for the stepper's next step, and the definition shall have no parameter, `input` step, guided `result` or kept field that can carry the key's value.

The manual guide of `google.create-credential@1`, built by the stepper's own manual guide from the same definition, shall be a numbered list that names that page and holds no field for a value.

## Examples

- Given the parameters `{ projectId: "acme-prod", keyName: "acme-maps" }`,
  when the manual guide is built,
  then its first numbered line is `1. Open https://console.cloud.google.com/apis/credentials`, with instructions that choose that project and restrict the key.
- Given those parameters with an extra `value`, `secret`, `key` or `token`,
  when they are parsed,
  then they are refused.
