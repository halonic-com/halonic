# contracts.connector-pin

- Status: active
- Since: 0.1.0
- Source: HAL-181; the `pin` on the `stdio` transport of `ConnectorClient` port v1 (HAL-231); plan phase 3, connector pinning; `app.package-runner-launch`, `app.connector-pin-version`

Where an adapter implements `ConnectorFactory` for `stdio`, and a trusted connector's transport has a `pin`, it shall start exactly the pin's package at the pin's version, in a folder of its own that is neither the workspace nor inside it nor around it, and a new folder for each client. It shall look the version up only at addresses under the pin's `registryUrl`, through the context's `http`, so a mirror in the user's profile is the only registry asked. It shall start no program when the registry doesn't list the version, doesn't hold the package or can't be reached; when the pin's version is a tag, a range or only part of a version, in which case it asks no registry at all; when the command asks for another version or another package, also through a package option or a PyPI spelling of the name; and when the connector's `env` sets, in any case, a variable `app.package-runner-launch` blocks. Without a trust grant it shall neither look the package up nor start it. A package runner without a `pin` shall still start once trusted, with no registry lookup. Refusing may happen in `create` or on the first call.

The suite's registries answer from recorded npm and PyPI responses (`RecordedRegistryClient`): the npm package document and the PyPI JSON API, trimmed to the fields a version lookup reads. No case reaches a real registry.

## Examples

- Given a trusted `npx -y @acme/mail-mcp` connector pinned to npm `@acme/mail-mcp` 2.3.1 at `https://npm.acme.test/registry`,
  when its tools are listed,
  then one program starts with that pin, in a folder outside the workspace, and every registry address asked for lies under `https://npm.acme.test/registry`.
- Given the same connector with the command `npx -y @acme/mail-mcp@3.0.0`,
  when its tools are listed,
  then it throws and no program starts.
- Given a pin to version `latest`,
  when its tools are listed,
  then it throws, no program starts and no registry is asked.
- Given a pinned connector whose `env` sets `npm_config_registry`,
  when its tools are listed,
  then it throws and no program starts.
