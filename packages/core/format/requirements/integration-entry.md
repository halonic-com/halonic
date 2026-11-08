# format.integration-entry

- Status: active
- Since: 0.1.0
- Source: HAL-135, the design comment of 8 Nov ("its own entry point"); the loader in `adapters/integration-kit`

The `@halonicjs/format/integration` entry point shall offer the permission sheet's schema, its checks, `integrationPolicy` and `parseIntegrationSheet`, which checks a sheet given as data with the same schema and checks as `parseFile`, and shall import only schema-kit and std (never `yaml`), so the integration kit and the conformance suite read sheets without loading the YAML parser.

## Examples

- Given the `knowledge-mcp`, `model-gemini` and `tool-google-drive` sheets, when each is read by `parseFile` and its value is given to `parseIntegrationSheet` as JSON data, then it passes with the same value.
- Given a sheet without `tokens` or `needs`, when it is given to `parseIntegrationSheet`, then both are `[]`.
- Given a sheet with an unknown key, when it is given to `parseIntegrationSheet`, then it fails with `unrecognized_keys` at the root.
- Given a secret whose `hosts` include a host the sheet doesn't declare, when it is given to `parseIntegrationSheet`, then it fails with `secret-host-not-declared` at that host.
- Given the imports of `src/integration/index.ts`, followed through every relative file, then the only packages are `@halonicjs/schema-kit` and `@halonicjs/std` and `parse-file.ts` is not among them.
