# integration-kit.spec-files

- Status: active
- Since: 0.1.0
- Source: HAL-3394 (HAL-1664 follow-up)

The kit shall publish the data shapes of the integration interface as JSON Schema 2020-12 spec files in its `spec/` folder: `integration.schema.json` for what an integration exports as data (its name, version and tools, without `connect`) and `secret-placement.schema.json` for the `auth` of a request. Each file shall equal what the code emits, and a missing or different file fails the test. The `$id` of each shall be `https://halonic.com/spec/integration-kit/<name>/v<N>.schema.json`, where `<N>` equals `integrationVersion`; if they differ, then the test shall fail. The `api-specs` check covers these files like those of the format. The `$id` only names the schema; nothing is hosted at that address.

## Examples

- Given the `integration` spec, when it is made, then it requires `name`, `version` and `tools`, and each tool requires `risk`.
- Given the `secret-placement` spec, when it is made, then it offers the `bearer`, `header` and `form` placements.
- Given a spec file that differs from the code, when the test runs, then it fails.
- Given `integrationVersion` is `1`, when a spec file's `$id` is read, then it ends in `v1.schema.json`.
