# action-catalog.paperclip-bind-variable

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, rows C1 and C5; Julian's security sign-off of #6728 (HAL-20401); Liam's plan OK on HAL-21110

If a request for `paperclip.bind-secret@1` names a `variable` that changes what an agent's run does, the action-catalog package shall refuse its parameters. The names on row C5's deny list are `PATH`, `NODE_OPTIONS`, `NODE_EXTRA_CA_CERTS`, `BASH_ENV` and `ENV`; a name that starts with `LD_`, `DYLD_`, `GIT_`, `PAPERCLIP_`, `PYTHON` or `SSL_CERT_`; and a name that ends with `_PROXY`, `_BASE_URL`, `_API_URL`, `_CA_BUNDLE`, `_ENDPOINT` or `_HOST`.

The secret's own `name` shall keep the plain secret-name pattern, since it never becomes an environment variable by itself.

## Examples

- Given `variable: "ANTHROPIC_BASE_URL"`, `"LD_PRELOAD"` or `"DOCKER_HOST"`,
  when the parameters are parsed,
  then they are refused.
- Given `variable: "ANTHROPIC_API_KEY"` or `"GITHUB_TOKEN"`,
  when the parameters are parsed,
  then they are taken.
