# Decision: a pinned connector also refuses registry options, proxies, certificates and preloads

- Requirements: `app.package-runner-launch`, `ports.connector-trust-enforcement`
- Task: HAL-2527, found by Julian while writing the pinning contract suite (HAL-181)
- Approval: the maintainer owns `core/app` and `core/ports`; Julian reviews it as the author of the
  contract suite that tests it

## What changes

Both requirements grow; nothing they allowed before is refused for a transport without a pin, and
no test was weakened. For a transport with a `pin`, `checkPackageRunnerLaunch` now also refuses:

- **Registry options in a runner's args:** `--registry`, an npm scope's `--@<scope>:registry`,
  `--userconfig`, `--globalconfig`, `--cache`, `--index-url` (`-i`), `--extra-index-url`,
  `--index`, `--default-index`, `--find-links` (`-f`), `--config-file`, `--cache-dir` and
  `--pip-args`, written with a space or an `=`.
- **Proxy variables:** `HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY`.
- **Certificate variables:** `NODE_EXTRA_CA_CERTS`, `NODE_TLS_REJECT_UNAUTHORIZED`,
  `SSL_CERT_FILE`, `SSL_CERT_DIR`, `REQUESTS_CA_BUNDLE`, `CURL_CA_BUNDLE`.
- **Preload variables:** `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_INSERT_LIBRARIES`,
  `DYLD_LIBRARY_PATH`.

Each group has its own refusal reason, as Tomas proposed on HAL-230. The existing reason for the
package-manager variables keeps its exact text.

## Why

Each of these can make the runner fetch a package of the same name and version from another
place, which is what the pin exists to stop. The rule lives in the shared check, not in the
`adapters/mcp` launcher alone, so every stdio launcher (the MCP adapter, the desktop shell, a later
sandboxed launcher) calls one check and the contract suite can hold each of them to it.

The task named eight variables and six options. I added their direct siblings (`SSL_CERT_DIR`,
`CURL_CA_BUNDLE`, `NODE_TLS_REJECT_UNAUTHORIZED`, the library-path variables, the npm scoped
registry, `--globalconfig`, `--cache`, `--index`, `--config-file`, `--cache-dir`, `--pip-args` and
the short `-i` and `-f`), because leaving one of them open undoes the rest.

An option is refused wherever it appears in the args, also after the package, where the package
reads it rather than the runner. The check can't tell where the runner's options end without
knowing every runner's grammar; a pinned connector that really needs a flag such as `-f` can be
trusted unpinned instead. This errs to the safe side, like the shell detection already does.

The launcher refuses these variables only when the connector's own `env` sets them, which the
workspace controls. A proxy, certificate or preload it inherits from its own process stays: that
is the person's machine, such as a company proxy, and dropping it would break pinned connectors
behind one. Only the package-manager and language variables are dropped when inherited, as before.
