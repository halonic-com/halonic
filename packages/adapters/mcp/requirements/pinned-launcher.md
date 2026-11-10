# mcp.pinned-launcher

- Status: active
- Since: 0.1.0
- Source: HAL-230 and HAL-2544 (connector pinning: version lookup against the pin's registry, a clean launch folder and refusal of any other version); `contracts.connector-pin`; the `pin` doc in `ports/connector-client.ts`; Liam's approval on HAL-230 and his review on HAL-4094 (10 Nov 2026: npm walking up out of the launch folder, system-wide config, uv's Python downloads); `mcp.runner-lookup`, wired in after HAL-4117

The MCP stdio connector factory shall pass `contracts.connector-pin`. For a stdio connector with a `pin`, it shall check the launch with `checkPackageRunnerLaunch`, counting each variable `secretEnv` sets as set by the connector's `env`, then ask only the pin's `registryUrl`, with a time limit, which package and version it lists, and refuse with `checkResolvedVersion` any other. Only a 404 shall be refused as a version the registry doesn't list; any other failing status shall be named in the reason. It shall then find the runner in the app's own environment (`mcp.runner-lookup`). It shall do all of this before it reads a secret or creates a folder, and refuse the start, with the reason, when any step fails. It shall then start the runner it found, after the leading arguments the lookup gives, with the pin's version added to the runner's arguments (`app.pinned-runner-args`), in a new folder outside the workspace that holds only an empty `package.json` and an empty npm config, so npm reads no project, `node_modules` or `.npmrc` above it, with the inherited environment minus its package-manager and language variables (`app.package-manager-variable`), the connector's `env`, every home, config, cache and temporary folder variable pointed at the launch folder, the registry set from `registryUrl`, npm's user and global config pointed at the folder's empty npm config, uv told to read no config file (`UV_NO_CONFIG`) and download no Python (`UV_PYTHON_DOWNLOADS=never`), pip told to read no config file (`PIP_CONFIG_FILE` set to the null device), the lookup's folders first on `PATH`, before the inherited `PATH` and under its own name in any letter case on Windows, and each secret in the environment only. It shall keep an inherited proxy, certificate or preload. It shall delete the launch folder once the connector is closed, and when the start fails after the folder was created. A package runner without a `pin` shall start as configured, like any trusted program, without a registry lookup.

## Examples

- Given a trusted connector `npx -y @acme/mail-mcp` pinned to 2.3.1 at `https://registry.npmjs.org`, which lists that version,
  when its tools are listed,
  then the `npx` found on this computer starts as `npx -y @acme/mail-mcp@2.3.1` in a folder of its own holding only `package.json` and an empty npm config, with `npm_config_registry` set to that address.
- Given the same connector whose command names `@acme/mail-mcp@3.0.0`,
  when its tools are listed,
  then it throws with the reason, no secret is read, no folder is created and nothing starts.
- Given a trusted connector `uvx mail-mcp` pinned to 2.3.1 at `https://pypi.org`, which answers 503,
  when its tools are listed,
  then it throws with a reason that names the 503, not one saying the version isn't listed.
- Given the same connector on a computer where no `npx` can be found,
  when its tools are listed,
  then it throws with a reason that names `npx`, no secret is read, no folder is created and nothing starts.
