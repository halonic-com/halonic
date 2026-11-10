# app.package-manager-variable

- Status: active
- Since: 0.1.0
- Source: HAL-230 and HAL-2544 (the pinned stdio launcher drops the package-manager and language variables it inherits, as the `pin` doc in `ports/connector-client.ts` says, from the one list `app.package-runner-launch` refuses)

The app shall tell a launcher whether a variable it inherits is a package-manager or language setting: in any case, `NODE_OPTIONS`, `NODE_PATH`, `PYTHONPATH`, `PYTHONSTARTUP`, `PYTHONHOME`, or a name starting with `npm_config_`, `YARN_`, `PNPM_`, `BUN_`, `COREPACK_`, `UV_`, `PIP_` or `PIPX_`. These are the variables of the first group `app.package-runner-launch` refuses, from the same list. A proxy, certificate, preload, config home or program lookup variable shall not count, because a pinned launch keeps those when it inherits them.

## Examples

- Given the names `NODE_OPTIONS`, `npm_config_registry`, `NPM_CONFIG_USERCONFIG`, `uv_index_url` and `PIP_INDEX_URL`,
  when each is asked about,
  then each is a package-manager variable.
- Given the names `HTTPS_PROXY`, `NODE_EXTRA_CA_CERTS`, `LD_PRELOAD`, `PATH` and `HOME`,
  when each is asked about,
  then none is.
