# Decision: a plugin trust refusal says what to do next

- Task: HAL-7941
- Approval: the team's call on [HAL-7941](/HAL/issues/HAL-7941), from Sofia's UX check on HAL-7925 and Mara's notes on halonic#2294
- Kind: internal

## What changes

`app.plugin-backend`: the refusal's message now names the fix. `not-trusted`, `changed` and
`record-unreadable` say `halonic trust --plugin <id>` (cli-output 3.10); for `record-unreadable`
trusting writes the record again, so it is no dead end. A trust status the code doesn't know
refuses with the new reason `not-checked` and a neutral message, because the person may have
trusted the plugin. The command line gets catalogue entries for `not-trusted`, `changed`, `record-unreadable` and `not-checked`, and for
`plugin-secret-name-missing`.

## Covers

- app.plugin-backend
