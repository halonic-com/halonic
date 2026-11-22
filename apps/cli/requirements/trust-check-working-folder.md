# cli.trust-check-working-folder

- Status: active
- Since: unreleased
- Source: HAL-16323: the CLI's trust check and Studio's show the same fields of a program

When a program connector starts in a folder other than the workspace's own, the `halonic` command's trust check shall show `Working folder` and that folder under the program's row, after its resolved path and before its `env` entries, with unsafe characters escaped.

## Examples

- Given Acme with `node files.js` found at `/usr/local/bin/node`, starting in `tools`, with the `env` entry `LOG_LEVEL` set to `debug`,
  when its trust check is shown,
  then under the program's row it reads `Resolved path   /usr/local/bin/node`, then `Working folder  tools`, then `Environment     LOG_LEVEL=debug`.
- Given a program that starts in the workspace's own folder,
  when its trust check is shown,
  then its row has no `Working folder` line.
