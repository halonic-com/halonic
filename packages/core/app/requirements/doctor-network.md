# app.doctor-network

- Status: active
- Since: unreleased
- Source: HAL-14262, from the first-run error check on HAL-14245 (C6), with the proxy setting of `http-node.proxy-config`

When the host finds a problem with the network settings, `halonic doctor` shall show a Network line with that problem and the variable the setting came from, marked as a warning and counted with the warnings: a proxy of a kind other than `http`, such as `https` or `socks5`, with its scheme, or a proxy setting that can't be used, with the host's reason. The host shall read the settings without any network call. Without a problem, or where the host checks nothing, there shall be no Network line.

## Examples

- Given `HTTPS_PROXY` set to an `https://` proxy,
  then the report has a Network line ! with `proxy-not-http`, `HTTPS_PROXY` and `https`, and the summary counts one warning.
- Given the host finds nothing wrong,
  then there is no Network line.
