# action-catalog.paperclip-bind-variable

- Status: active
- Since: unreleased
- Source: stream HAL-17488 (user-only action steppers); architecture note on HAL-17491, rows C1 and C5; Julian's security sign-off of #6728 (HAL-20401); Liam's plan OK on HAL-21110; the deny list extended in the security review of #6980 (HAL-21241, HAL-21250)

If a request for `paperclip.bind-secret@1` names a `variable` on the deny list, then the action-catalog package shall refuse its parameters. The deny list holds the names `PATH`, `NODE_OPTIONS`, `NODE_EXTRA_CA_CERTS`, `NODE_TLS_REJECT_UNAUTHORIZED`, `BASH_ENV`, `ENV`, `GOPROXY`, `PIP_INDEX_URL`, `PIP_EXTRA_INDEX_URL`, `UV_INDEX_URL`, `UV_DEFAULT_INDEX`, `OPENAI_API_BASE`, `CLAUDE_CODE_SHELL_PREFIX`, `EDITOR`, `VISUAL`, `BROWSER`, `JAVA_TOOL_OPTIONS`, `JDK_JAVA_OPTIONS`, `PERL5OPT`, `RUBYOPT`, `BUN_OPTIONS`, `HOME`, `XDG_CONFIG_HOME`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME` and `ZDOTDIR`; a name that starts with `LD_`, `DYLD_`, `GIT_`, `PAPERCLIP_`, `PYTHON`, `SSL_CERT_`, `NPM_CONFIG_`, `AWS_ENDPOINT_URL` or `CARGO_TARGET_`; and a name that ends with `_PROXY`, `_BASE_URL`, `_API_URL`, `_CA_BUNDLE`, `_ENDPOINT`, `_HOST`, `_INDEX`, `_INDEX_URL`, `_FIND_LINKS`, `_REGISTRY`, `_SERVER`, `_OPTS`, `_OPTIONS`, `_HOME` or `_DIR`.

The secret's own `name` shall keep the plain secret-name pattern, since it never becomes an environment variable by itself.

## Examples

- Given `variable: "ANTHROPIC_BASE_URL"`, `"LD_PRELOAD"` or `"DOCKER_HOST"`,
  when the parameters are parsed,
  then they are refused.
- Given `variable: "ANTHROPIC_API_KEY"` or `"GITHUB_TOKEN"`,
  when the parameters are parsed,
  then they are taken.
