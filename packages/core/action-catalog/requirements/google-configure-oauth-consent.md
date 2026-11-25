# action-catalog.google-configure-oauth-consent

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 7.8 and 7.9; task HAL-17557

When a request names `google.configure-oauth-consent@1` with a Google Cloud `projectId`, the action-catalog package shall offer one `guided` step that opens the consent screen page of that project on `https://console.cloud.google.com/` with numbered instructions, ask for no result and no secret, tell the user a client secret goes only into the native secret dialog, preview it in one sentence that says Halonic cannot check it, and give a manual guide that is a numbered list holding the page address.

## Examples

- Given the project id `acme-prod`,
  when the manual guide is built,
  then its first numbered line is `1. Open https://console.cloud.google.com/auth/overview?project=acme-prod` and every following instruction is numbered.
- Given the project id `Acme_Prod`,
  when they are parsed,
  then they are refused.
