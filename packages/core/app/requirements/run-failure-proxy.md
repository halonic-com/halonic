# app.run-failure-proxy

- Status: active
- Since: unreleased
- Source: HAL-12606 (Nina's docs check, HAL-12594 section 8, P10: a proxy failure read as "Check your internet connection"); the facts move here with the rest of a failed run's facts (HAL-12411)

When a run fails `model-unreachable` after calling a known model and the cause of its `run.failed` has a `proxy.` code (requirement `http-node.proxy-failure-cause`), the app shall give the facts `proxy-failed` instead of `model-unreachable`: the provider, the variable the proxy came from (`HTTPS_PROXY` when the cause names none), and the problem the code names (`setting`, `unreachable`, `timeout`, `refused`, `credentials`, `plain-http` or `insecure`) with the proxy as `http://host:port` and the host where that problem's lines name them. A `proxy.` code the app doesn't know, or one without the facts its lines need, shall be the problem `other`. Any other cause, or none, shall keep the `model-unreachable` facts.

## Examples

- Given a run that failed `model-unreachable` at OpenAI with the cause `proxy.refused`, the proxy `http://127.0.0.1:3128` from `https_proxy` and the host `api.openai.com`,
  when its facts are read,
  then they are `proxy-failed` with the problem `refused`, that proxy, that host and the variable `https_proxy`.
- Given the cause `proxy.refused` without a proxy or a host,
  when its facts are read,
  then the problem is `other` and the variable is `HTTPS_PROXY`.
- Given a `model-unreachable` run whose cause has the code `network.refused`,
  when its facts are read,
  then they are `model-unreachable`.
