# studio.trust-review-connector-lines

- Status: active
- Since: unreleased
- Source: HAL-16336: Studio's trust check shows every connector field its fingerprint covers, with the CLI's labels (`cli.trust-check-connector-lines`), from one builder (`app.connector-trust-fields`)

The desktop app's trust check shall show, under each connector's row, **Offered tools** with the tools it offers when `tools.allow` limits them, **Asks first** with the tools that ask a person first, or "every tool" for `approve: all`, **Without asking** with the tools that run without asking, **Headers** with each of an HTTP connector's headers as `Name: value`, one per line, and **Other settings** with each field the schema doesn't know as `key.path: value`, one per line. It shall mark tool names and entries as code, so they show in mono. A new or changed connector shall show the same lines.

## Examples

- Given an HTTP connector `mail` with `tools.allow` `read_mail` and `send_mail`, `tools.approve` `send_mail` and the header `X-Team: acme`,
  when its check opens,
  then its row reads **Offered tools** `read_mail, send_mail`, **Asks first** `send_mail` and **Headers** `X-Team: acme`.
- Given a connector with `approve: all`,
  when its check opens,
  then its row reads **Asks first** every tool.
- Given a program with a field `retries: 3` the schema doesn't know,
  when its check opens,
  then its row reads **Other settings** `retries: 3`.
