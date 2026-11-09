# ports.connector-trust-enforcement

- Status: draft
- Since: 0.1.0
- Source: HAL-659 review of HAL-231: without these rules an untrusted or edited workspace could get around the trust grant and the pin of `ports.connector-trust-inputs`. It becomes active when the connector contract suites (HAL-181) prove it. HAL-2134 (release check C188): an unpinned package runner starts once a person has trusted it. HAL-2527: registry options in the args, and proxy, certificate and preload variables, can also move a pinned package.

The connector port's documentation shall state these rules, and the adapters and the host shall follow them:

- **Without a grant**, a `stdio` connector doesn't start its program, an `http` connector's `callTool` throws for every tool, and the `google` connector's `callTool` throws for every tool whose own `risk` isn't `read`. The host ignores any `risk` the workspace sets, counts every tool an `http` or `stdio` connector lists as `write`, and calls no tool whose risk isn't `read`.
- **A package runner starts only as trusted, and its pin is exact.** A stdio `command` whose program name, without its folder, any case and any `.cmd`, `.exe`, `.bat` or `.ps1` ending, is `npx`, `bunx` or `uvx`, or one of `npm exec`, `pnpm dlx`, `yarn dlx`, `pipx run` and `uv tool run`, may start without a `pin`, but like every stdio program only with a trust grant, and its command and args are in the fingerprint the person confirmed. A pin whose `version` is a tag or a range doesn't start.
- **The environment can't override the pin.** With a pin, the adapter doesn't start when `env` sets, in any case, `NODE_OPTIONS`, `NODE_PATH`, `PYTHONPATH`, `PYTHONSTARTUP`, `PYTHONHOME`, or a name starting with `npm_config_`, `YARN_`, `PNPM_`, `BUN_`, `COREPACK_`, `UV_`, `PIP_` or `PIPX_`, or a proxy (`HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY`), a certificate setting (`NODE_EXTRA_CA_CERTS`, `NODE_TLS_REJECT_UNAUTHORIZED`, `SSL_CERT_FILE`, `SSL_CERT_DIR`, `REQUESTS_CA_BUNDLE`, `CURL_CA_BUNDLE`) or a preload (`LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_INSERT_LIBRARIES`, `DYLD_LIBRARY_PATH`).
- **The args can't override the pin.** With a pin, a package runner doesn't start when an argument is a runner option that fetches from somewhere other than `registryUrl`, such as `--registry`, `--userconfig`, `--index-url`, `--extra-index-url`, `--default-index` or `--find-links`; `app.package-runner-launch` holds the full list. Every stdio launcher calls `checkPackageRunnerLaunch` for these rules and keeps no copy of them.

The pure checks are built and the launcher isn't (HAL-1132). The exact-version rule, which refuses tags and ranges and checks a resolved version against the pin, is a pure check in `@halonicjs/app`, active as `app.connector-pin-version`. Reading `name@1.2.3` or `name==1.2.3` from a command, which also refuses URLs and git sources, is active as `app.connector-pin-spec`. Telling a package runner from another command, also behind a shell such as `cmd /c npx …`, and refusing a pinned one with arguments that name another package or version, or with arguments or an environment that could override the pin, is active as `app.package-runner-launch`. This requirement stays draft until the stdio launcher (HAL-230) exists and calls those checks before it starts a program, starts in a clean launch folder of its own, ignores the workspace's package-manager settings, and looks the version up only at `registryUrl`, tested against recorded npm and PyPI responses. The grant rules for the adapters wait on the same launcher and the connector contract suites (HAL-181).

## Examples

- Given an untrusted workspace whose YAML sets `risk: read` on a tool its `http` connector lists,
  when the agent calls that tool,
  then the host refuses it and the adapter's `callTool` throws.
- Given a stdio transport with `command: "NPX.CMD"`, `args: ["-y", "@acme/mail-mcp"]` and no `pin`,
  when the adapter is asked to start it without a trust grant,
  then it refuses.
- Given the same transport and a trust grant whose fingerprint holds its command and args,
  when the adapter is asked to start it,
  then it starts.
- Given a pinned stdio transport whose `pin.version` is `latest` or `^2.3.1`,
  when the adapter is asked to start it,
  then it refuses.
- Given a pinned stdio transport whose `env` sets `node_options` to `--require ./evil.js` or `NPM_CONFIG_REGISTRY` to another address,
  when the adapter is asked to start it,
  then it refuses.
- Given a stdio transport pinned to `@acme/mail-mcp` at `2.3.1` whose `args` are `--registry=https://evil.test`, `-y` and `@acme/mail-mcp`, or whose `env` sets `HTTPS_PROXY` or `LD_PRELOAD`,
  when the adapter is asked to start it,
  then it refuses.
