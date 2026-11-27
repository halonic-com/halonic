# action-catalog.paperclip-bind-secret

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, sections 1.2, 7.1 and 7.8; task HAL-17553, scope from Liam's answer on HAL-20273, row C1 and section 6.8

When a request names `paperclip.bind-secret@1` with a Paperclip `host`, a company prefix `company`, a secret `name`, an `agent` and an environment `variable`, the action-catalog package shall offer one `guided` step of risk `irreversible` that opens `https://{host}/{company}/company/settings/secrets` with numbered instructions for giving that one agent access to that one secret as that variable, and the definition shall have no parameter, `input` step, guided `result` or kept field that can carry the secret's value.

The preview of `paperclip.bind-secret@1` shall say that the agent can read the secret's value from then on.

While the Paperclip admin key of section 6.8 is undecided (HAL-20274), the definition shall have no `call` step, so no Paperclip write route is in the shell's list.

## Examples

- Given `{ host: "paperclip.acme.example", company: "ACME", name: "ANTHROPIC_API_KEY", agent: "Writer", variable: "ANTHROPIC_API_KEY" }`,
  when the manual guide is built,
  then it names `Writer` and `ANTHROPIC_API_KEY` and its first numbered line is `1. Open https://paperclip.acme.example/ACME/company/settings/secrets`.
- Given an `agent` with a line break, or a `variable` with `=` or a space,
  when the parameters are parsed,
  then they are refused.
