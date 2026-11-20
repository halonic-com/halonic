# Decision: a local integration's connector file gives its settings and secret picks

- Task: HAL-14092
- Approval: Liam approves this change on HAL-14099, his security review of halonic#4144 (option 1 of HAL-14092). A team decision with no board card (HAL-2282 rule): it adds two optional keys to a file format, no screen or flow.
- Kind: user-visible

## What changes

A connector file with the `integration` transport may now hold `settings` (plain string, number
or boolean values, such as the `url` a `{ fromSetting }` host reads) and `secrets` (a secret name
in the integration's sheet → the workspace secret it gets, by name only). The golden
`packages/core/format/spec/connector.schema.json` gains the two optional keys; nothing in it is
removed and every existing connector file reads as before.

The requirements `format.connector-runner-transports` and `cli.open-local-integration` gain a
sentence and examples for this. `format.connector-runner-transports` also refuses a setting that
holds a pasted key, with the free-text test a local program's `env` gets (`value-looks-like-key`),
since settings are kept as written. `format.secret-names` now checks each `secrets` value like a
`secretEnv` value, so a pasted key, a bad name or a name that belongs to Halonic or a plugin
(`secret-name-reserved`) is refused in the file check, not at run time. Two new requirements,
`workspace.integration-settings` and `app.integration-connector-settings`, record the new workspace
check and how the trust check reads the settings. The `trustSubjectOf` and `doctorWorkspace` tests
now compare the integrations with `toEqual` instead of `toBe`, because each integration is copied
with its settings; they check the same values. No test was weakened or skipped.

## Why

Before this, no local integration with a `{ fromSetting }` host or a secret could start from a
connector file: the opener passed no settings and no secret picks, so the load was refused with
`setting-missing`. The Paperclip connector (HAL-3103) needs both. The settings go into the trust
content through the integration (as an address) and the connector (as written), and the secret
picks by name, so changing either needs the workspace to be trusted again. Two connector files
that give one folder different settings are refused, because the trust check holds one set of
settings for each folder.

## Covers

- packages/core/format/spec/connector.schema.json
- format.connector-runner-transports
- format.secret-names
- cli.open-local-integration
- workspace.integration-settings
- app.integration-connector-settings
- packages/core/app/src/trust-subject.test.ts
- apps/cli/src/doctor-workspace.test.ts
