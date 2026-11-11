# app.connector-factories

- Status: active
- Since: 0.1.0
- Source: HAL-6266 (`inheritEnv`); HAL-4846 (Liam's decision on HAL-2824: one host-side factory the CLI uses now and the engine's turn assembly later, HAL-998); `ConnectorFactory` port v1

The connector factories shall take at most one factory per transport kind, refusing a second one for the same kind. They shall create each connector with the factory for its transport, passing the context, its trust grant included, unchanged, and refuse a connector whose transport no factory serves, naming the connector. Listing a connector's tools shall close the connector afterwards, also when the listing fails. A workspace's connector file shall become the factories' config with its transport, headers, environment, `secretEnv`, `inheritEnv` and `cwd` as written, an `http` connector's `secret` as its secret, and no `pin`.

## Examples

- Given factories for `stdio` and `http`,
  when a `stdio` connector is created,
  then the `stdio` factory creates it with the caller's context and trust grant.
- Given factories for `stdio` only,
  when a `google` connector is created,
  then it throws, naming the connector.
- Given a connector whose listing fails,
  when its tools are listed,
  then the error is thrown and the connector is closed.
