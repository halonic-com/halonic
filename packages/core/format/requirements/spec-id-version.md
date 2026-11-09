# format.spec-id-version

- Status: active
- Since: 0.1.0
- Source: HAL-1664

The `$id` of each spec file `spec/<kind>.schema.json` shall have the form `https://halonic.com/spec/format/<kind>/v<N>.schema.json`, where `<N>` equals the `const` of the kind's `version` key. For a kind without a `version` key, which today is only `skill` (its file is SKILL.md front matter), `<N>` shall equal the format's `SCHEMA_VERSION` instead. If the two numbers differ, then the test shall fail. The `$id` only names the schema; nothing is hosted at that address.

## Examples

- Given the `workflow` kind with `version` const `1`, when its spec file is read, then its `$id` is `https://halonic.com/spec/format/workflow/v1.schema.json`.
- Given the `skill` kind, which has no `version` key, when its spec file is read, then the `v<N>` in its `$id` equals `SCHEMA_VERSION`.
- Given a spec whose `$id` says `v1` while its `version` const is `2`, when it is checked, then the check fails.
