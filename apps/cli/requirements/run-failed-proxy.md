# cli.run-failed-proxy

- Status: active
- Since: unreleased
- Source: HAL-12606 (Nina's docs check, HAL-12594 section 8, P10: a proxy failure read as "Check your internet connection"); the words decided by the team on the task, as they build on the approved `model-unreachable` lines (board, HAL-2282)

When a run fails `model-unreachable` and the cause of its `run.failed` has a `proxy.` code (requirement `http-node.proxy-failure-cause`), so its facts are `proxy-failed` (requirement `app.run-failure-proxy`), the CLI shall print the proxy's lines instead of "Check your internet connection": line 1 names what the proxy did, the proxy as `http://host:port` and the variable it came from (or, for an unusable setting or a plain `http://` host, the variable and the host), and line 2 the one fix: set the variable to `http://host:port`, start the proxy, ask whoever runs it to allow the host, fix the user name and password, use `https://` or `NO_PROXY`, or trust the company's certificate. A `proxy.` code the app doesn't know, or one without the facts its lines need, shall say Halonic couldn't use the proxy and to check the variable. Any other cause keeps the `model-unreachable` lines. The proxy's own message stays in the engine's error, which `--debug` prints.

## Examples

- Given a run that failed `model-unreachable` with the cause `proxy.refused`, the proxy `http://127.0.0.1:3128` from `HTTPS_PROXY`, the host `api.openai.com` and the status 403,
  when its lines are printed,
  then line 1 says the proxy from `HTTPS_PROXY` refused to connect to `api.openai.com`, and line 2 says to ask whoever runs the proxy to allow it.
- Given the cause `proxy.setting` from `https_proxy`, as for `socks5://…` or a value without `http://`,
  when its lines are printed,
  then line 2 says `Set https_proxy to http://host:port, then run again.`
- Given the cause `proxy.plain-http` for `model.test`,
  when its lines are printed,
  then line 2 offers an `https://` baseUrl or `NO_PROXY`.
- Given a `model-unreachable` run whose cause has no `proxy.` code,
  when its lines are printed,
  then they are the `model-unreachable` lines.
