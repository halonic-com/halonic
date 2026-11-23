# cli.trust-check-connector-lines

- Status: active
- Since: unreleased
- Source: HAL-16336: the trust check shows every connector field its fingerprint covers, with the same fields as Studio's (`app.connector-trust-fields`)

The `halonic` command's trust check shall show, under each connector's row, `Offered tools` with the tools it offers when `tools.allow` limits them, `Asks first` with the tools that ask a person first, or `every tool` for `approve: all`, `Without asking` with the tools that run without asking, `Headers` with each of an HTTP connector's headers as `Name: value`, one per line, and `Other settings` with each field the schema doesn't know as `key.path: value`, one per line, with unsafe characters escaped. Under a program they shall come after its `Environment` lines and before its sites.

## Examples

- Given an HTTP connector `mail` with `tools.allow` `read_mail` and `send_mail`, `tools.approve` `send_mail` and the header `X-Team: acme`,
  when its trust check is shown,
  then under its address it reads `Offered tools   read_mail, send_mail`, then `Asks first      send_mail`, then `Headers         X-Team: acme`.
- Given a connector with `approve: all`,
  when its trust check is shown,
  then under its row it reads `Asks first   every tool`.
- Given a program with a field `retries: 3` the schema doesn't know,
  when its trust check is shown,
  then under its row it reads `Other settings   retries: 3`.
