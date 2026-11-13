# engine.turn-declared-tools

- Status: active
- Since: 0.1.0
- Source: HAL-8255, Liam's decision of 13 Nov; the fields are `events.tool-result-risk` and `format.integration-tool-noun`

When a turn is given the tools a person's integration sheet declares for a connector, by the name its server lists them under (`declaredTools`), the engine shall take a listed tool's `noun` and `verb` from that entry only, and copy them into the `tool.result` of a call to it, leaving out whichever the entry lacks. Nothing a server lists shall set or change a `noun` or `verb`, a field of the listing named `noun` included. The engine shall count the call's risk as the higher of the sheet's `risk` and the one the listing gives, so a sheet can raise a tool's risk and the listing can too, and neither can lower it; the `risk` in the `tool.result` is that higher one. A tool the listing has but the sheet doesn't declare shall behave as without a sheet. A tool the sheet declares but the listing lacks shall not be offered.

## Examples

- Given a server tool `send_email` listed without a `risk`, and a sheet that declares it with `risk: "send"`, `noun: { one: "email", many: "emails" }` and no `verb`,
  when the model calls it and it answers,
  then its `tool.result` has `risk: "send"` and that `noun`, and no `verb`.
- Given a server tool `save_file` and a sheet that declares it with `verb: "saved"`,
  when the model calls it,
  then its `tool.result` has that `noun` and `verb: "saved"`.
- Given a server tool listed with a field `noun: { one: "gift", many: "gifts" }` and no sheet,
  when the model calls it,
  then its `tool.result` has no `noun`.
- Given a server tool listed as `send` and a sheet that declares it as `read`,
  when the engine counts its risk,
  then it counts as `send`, and the `tool.result` has `risk: "send"`.
- Given a sheet that declares `delete_all`, which the listing doesn't have,
  when the turn's tools are built,
  then `delete_all` isn't offered.
