# mcp.pinned-launcher

- Status: active
- Since: 0.1.0
- Source: HAL-230 and HAL-2544 (connector pinning: version lookup against the pin's registry, a clean launch folder and refusal of any other version); `contracts.connector-pin`; the `pin` doc in `ports/connector-client.ts`; Liam's approval on HAL-230 (10 Nov 2026)

The MCP stdio connector factory shall pass `contracts.connector-pin`. For a stdio connector with a `pin`, it shall check the launch with `checkPackageRunnerLaunch`, counting each variable `secretEnv` sets as set by the connector's `env`, then ask only the pin's `registryUrl`, with a time limit, which package and version it lists, and refuse with `checkResolvedVersion` any other. It shall do all of this before it reads a secret or creates a folder, and refuse the start, with the reason, when any step fails. It shall then start the runner with the pin's version added to its arguments (`app.pinned-runner-args`), in a new empty folder outside the workspace, with the inherited environment minus its package-manager and language variables (`app.package-manager-variable`), the connector's `env`, every home, config, cache and temporary folder variable pointed at the launch folder, the registry set from `registryUrl`, and each secret in the environment only. It shall keep an inherited proxy, certificate or preload. It shall delete the launch folder once the connector is closed, and when the start fails after the folder was created. A package runner without a `pin` shall start as configured, like any trusted program, without a registry lookup.

## Examples

- Given a trusted connector `npx -y @acme/mail-mcp` pinned to 2.3.1 at `https://registry.npmjs.org`, which lists that version,
  when its tools are listed,
  then `npx -y @acme/mail-mcp@2.3.1` starts in an empty folder of its own, with `npm_config_registry` set to that address.
- Given the same connector whose command names `@acme/mail-mcp@3.0.0`,
  when its tools are listed,
  then it throws with the reason, no secret is read, no folder is created and nothing starts.
