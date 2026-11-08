# ports.connector-trust-inputs

- Status: active
- Since: 0.1.0
- Source: HAL-65 requirements (trust gate and connector pinning), decided for version 1 on HAL-181: both are inputs adapters must honor, so they must be in the port before the freeze

`ConnectorFactoryContext` shall carry the trust grant for the connector's workspace, as a required field that is `null` when the workspace isn't trusted, so the launcher and the tools that act outside can refuse without one. The stdio transport shall carry an optional `pin` with the registry kind, the registry address, the package and the exact version, which the app fills from the trust record and never from workspace YAML.

The rules adapters and the host follow with these inputs are in `ports.connector-trust-enforcement`.

## Examples

- Given a `ConnectorFactoryContext` without `trust`,
  when it is compiled,
  then it doesn't compile.
- Given a `ConnectorFactoryContext` with `trust: null` or a grant with a location and a fingerprint,
  when it is passed to a `ConnectorFactory`,
  then it compiles.
- Given a stdio transport with a `pin` for `@acme/mail-mcp` at `2.3.1` from the npm registry,
  when it is compiled,
  then it compiles; an HTTP or Google transport with a `pin` doesn't.
- Given a `pin` with `registry: "cargo"` or without `registryUrl`,
  when it is compiled,
  then it doesn't compile.
