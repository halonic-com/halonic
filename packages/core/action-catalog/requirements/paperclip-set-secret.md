# action-catalog.paperclip-set-secret

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 7.1 and 7.8; task HAL-17553, scope from Liam's answer on HAL-20273, row C1 and section 6.8

When a request names `paperclip.set-secret@1` with a Paperclip `host`, a company prefix `company` and a secret `name`, the action-catalog package shall offer one `guided` step of risk `admin` that opens `https://{host}/{company}/company/settings/secrets` with numbered instructions for creating or rotating that one secret there, and the definition shall have no parameter, `input` step, guided `result` or kept field that can carry the secret's value.

The manual guide of `paperclip.set-secret@1` shall be a numbered list that names that page and holds no field for a value.

While the Paperclip admin key of section 6.8 is undecided (HAL-20274), the definition shall have no `call` step, so no Paperclip write route is in the shell's list.

## Examples

- Given `{ host: "paperclip.acme.example", company: "ACME", name: "ANTHROPIC_API_KEY" }`,
  when the manual guide is built,
  then its first numbered line is `1. Open https://paperclip.acme.example/ACME/company/settings/secrets`.
- Given those parameters with an extra `value`, `secret`, `key` or `token`, or a `host` with a path, port or user name,
  when they are parsed,
  then they are refused.
