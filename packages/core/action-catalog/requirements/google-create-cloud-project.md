# action-catalog.google-create-cloud-project

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 7.8 and 7.9; task HAL-17557

When a request names `google.create-cloud-project@1` with a Google Cloud `projectId`, the action-catalog package shall offer one `guided` step that opens `https://console.cloud.google.com/projectcreate` with numbered instructions, take the project id back as a non-secret result that must match `^[a-z][a-z0-9-]{5,29}$`, preview it in one sentence that says Halonic cannot check it, and give a manual guide that is a numbered list holding that address.

## Examples

- Given the project id `acme-prod`,
  when the manual guide is built,
  then its first numbered line is `1. Open https://console.cloud.google.com/projectcreate` and every following instruction is numbered.
- Given the project id `Acme_Prod`,
  when they are parsed,
  then they are refused.
