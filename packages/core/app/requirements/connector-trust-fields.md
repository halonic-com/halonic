# app.connector-trust-fields

- Status: active
- Since: unreleased
- Source: HAL-16336: the trust check shows every connector field its fingerprint covers, in the CLI and in Studio, from one builder

The app shall give the fields any connector's row in the trust check shows beyond its address or command, read from its trust content: the tools it offers when `tools.allow` limits them, the tools that ask a person first (`tools.approve`, a list or `all`), the tools that run without asking (`tools.read`), an HTTP connector's headers as `Name: value` in name order, and every field the trust content keeps under `unknown`, as `key.path: value` with the value as JSON. It shall leave the text as written, for each screen to escape as it shows it.

## Examples

- Given an HTTP connector with `tools.allow` `send_mail` and `read_mail`, `tools.approve` `send_mail` and the headers `X-Team: acme` and `Accept: json`,
  when its fields are read,
  then they offer `read_mail` and `send_mail`, ask first for `send_mail` and hold the headers `Accept: json`, then `X-Team: acme`.
- Given a connector with no `tools.allow`,
  when its fields are read,
  then they name no offered tools, so it offers every tool.
- Given a connector with a field `retries: 3` the schema doesn't know,
  when its fields are read,
  then its other settings hold `retries: 3`.
