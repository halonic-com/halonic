# cli.doctor-network

- Status: active
- Since: unreleased
- Source: HAL-14262, from Kim's first-run error check on HAL-14245 (C6), the wording approved by the team (Liam); the proxy setting of `http-node.proxy-config`

The `halonic doctor` command shall show a Network line, after Node.js and before Disk, marked with !, when the proxy setting Halonic started with (`https_proxy` or `HTTPS_PROXY`) can't be used, read with the same parsing as every model call and without any network call. For a proxy of another kind than `http`, such as `https` or `socks5`, the line shall name the variable and the scheme; for any other problem it shall name the variable, with the setting's own reason under it. `doctor` shall still exit with 0 for it. Without a proxy, or with an `http://` one, there shall be no Network line. With `--json`, the check shall be `network` with its `problem` and `variable`.

## Examples

- Given `HTTPS_PROXY` set to `https://proxy.corp:3129`,
  when `halonic doctor` runs,
  then it prints "! Network     HTTPS_PROXY is an https:// proxy; Halonic only uses http:// proxies" before the Disk line, and exits with 0.
- Given `https_proxy` set to `socks5://proxy.corp:1080`,
  then the Network line says "https_proxy is a socks5:// proxy; Halonic only uses http:// proxies".
- Given `HTTPS_PROXY` set to `proxy.corp:3128`,
  then the Network line says "HTTPS_PROXY is set, and Halonic can't use it." with "The proxy setting is not a URL. Halonic needs it as http://host:port." under it.
- Given no proxy, or `HTTPS_PROXY` set to `http://proxy.corp:3128`,
  then there is no Network line.
