# contracts.connector-pin

- Status: active
- Since: 0.1.0
- Source: HAL-181; the `pin` on the `stdio` transport of `ConnectorClient` port v1 (HAL-231); plan phase 3, connector pinning; `app.package-runner-launch`, `app.connector-pin-version`

Where an adapter implements `ConnectorFactory` for `stdio`, and a trusted connector's transport has a `pin`, it shall start exactly the pin's package at the pin's version, in a folder of its own that is neither the workspace nor inside it nor around it, also when the transport sets a `cwd`, and a new folder for each client. The program it spawns shall be an npm runner for an npm pin and a PyPI runner for a PyPI pin; its arguments shall name the package at the pin's version (`@acme/mail-mcp@2.3.1`, `mail-mcp==2.3.1`) and at no other version; its environment shall set the registry to `registryUrl` (`npm_config_registry` for npm; for PyPI at least one of `UV_DEFAULT_INDEX`, `UV_INDEX_URL` and `PIP_INDEX_URL`, at `{registryUrl}/simple`, with every one present saying the same); and it shall pass on none of the variables `app.package-runner-launch` blocks with the value the adapter inherited. It shall look the version up only at addresses under the pin's `registryUrl`, through the context's `http`, so a mirror in the user's profile is the only registry asked. It shall start no program when the registry doesn't list the version, doesn't hold the package or can't be reached; when the pin's version is a tag, a range or only part of a version, in which case it asks no registry at all; when the command asks for another version or another package, also through a package option or a PyPI spelling of the name; and when the connector's `env` sets, in any case, a variable `app.package-runner-launch` blocks. Without a trust grant it shall neither look the package up nor start it. A package runner without a `pin` shall still start once trusted, with no registry lookup. Refusing may happen in `create` or on the first call.

The suite's registries answer from recorded npm and PyPI responses (`RecordedRegistryClient`): the npm package document at `{registryUrl}/{name}` and the PyPI JSON API at `{registryUrl}/pypi/{name}/json` and `{registryUrl}/pypi/{name}/{version}/json`, trimmed to the fields a version lookup reads; any other address, such as npm's `{registryUrl}/{name}/{version}`, answers 404. No case reaches a real registry. Each harness reports every program as it was spawned (`ConnectorLaunch`: `command`, `args`, `env`, `folder` and `pin`), and takes the suite's `inheritedEnv` as its own process's environment, which sets every blocked variable to move the registry or run code first.

## Examples

- Given a trusted `npx -y @acme/mail-mcp` connector pinned to npm `@acme/mail-mcp` 2.3.1 at `https://npm.acme.test/registry`,
  when its tools are listed,
  then one program starts with that pin, its arguments name `@acme/mail-mcp@2.3.1`, its `npm_config_registry` is `https://npm.acme.test/registry`, it starts in a folder outside the workspace, and every registry address asked for lies under `https://npm.acme.test/registry`.
- Given that connector with `cwd` set to `tools/mail` inside the workspace,
  when its tools are listed,
  then its program starts neither in `tools/mail` nor anywhere in the workspace.
- Given an adapter whose own environment sets `npm_config_registry` to another registry and `NODE_OPTIONS`,
  when a pinned connector's tools are listed,
  then the program it spawns gets neither inherited value.
- Given the same connector with the command `npx -y @acme/mail-mcp@3.0.0`,
  when its tools are listed,
  then it throws and no program starts.
- Given a pin to version `latest`,
  when its tools are listed,
  then it throws, no program starts and no registry is asked.
- Given a pinned connector whose `env` sets `npm_config_registry`,
  when its tools are listed,
  then it throws and no program starts.
