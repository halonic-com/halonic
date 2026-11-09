# contracts.trust-fingerprint

- Status: active
- Since: 0.1.0
- Source: HAL-684; "Fingerprint coverage" in the HAL-188 plan (from HAL-675); `TrustStore` port v1

The trust fingerprint of a workspace's connectors shall change when an attacker edits anything that decides what runs or where it talks to: a program's command, arguments, folder, variables (`NODE_OPTIONS`, `PYTHONSTARTUP`, `LD_PRELOAD`, a changed value, a `${VAR}` pointed elsewhere, a variable set from a secret), an HTTP address's scheme, host, port, path or query, its header names, the transport, the secret a connector uses, the Google account, and the workspace's approval, offered-tool and local settings. It shall stay the same when the files only write the same connectors differently: keys in another order, connectors or tool names in another order, a folder through `..`, a host in Unicode or punycode, or in capitals.

## Examples

- Given a trusted program connector,
  when the workspace adds `NODE_OPTIONS=--require ./x.js` to its variables,
  then the fingerprint changes.
- Given a trusted HTTP connector at `https://mcp.acme.test/v1/mcp`,
  when the workspace changes it to `http://` or to the path `/v1/admin`,
  then the fingerprint changes.
- Given a trusted HTTP connector,
  when the workspace switches the same connector to a program,
  then the fingerprint changes.
- Given a trusted connector that asks before `delete_file` runs,
  when the workspace stops asking,
  then the fingerprint changes.
- Given a host written as `bücher.acme.test`,
  when it is written as `xn--bcher-kva.acme.test` instead,
  then the fingerprint stays the same.
- Given two connectors from separate files,
  when the folder lists them in another order,
  then the fingerprint stays the same.
- Given a fingerprint of only the command, the arguments and the host,
  when the attack cases run,
  then the suite reports the cases it misses.
