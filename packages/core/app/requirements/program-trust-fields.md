# app.program-trust-fields

- Status: active
- Since: unreleased
- Source: HAL-16323: the CLI's trust check and Studio's show the same fields of a program, from one builder

The app shall give the fields a program connector's row in the trust check shows, read from its trust content: its command and arguments as one line, the variables it takes from the person's environment, the path its command resolves to on this computer when it was found, the folder it starts in when it isn't the workspace's own (`.`), each of its own `env` entries as `NAME=value` in name order, the sites it may reach in a sandbox, and the registry an unpinned version downloads from. It shall leave the text as written, for each screen to escape as it shows it.

## Examples

- Given a program `node tools/files.js` found at `/usr/local/bin/node`, starting in `tools`, with the `env` entries `NODE_OPTIONS` set to `--require ./setup.js` and `LOG_LEVEL` set to `debug`,
  when its fields are read,
  then they hold the command `node tools/files.js`, the path `/usr/local/bin/node`, the working folder `tools` and the environment `LOG_LEVEL=debug`, then `NODE_OPTIONS=--require ./setup.js`.
- Given a program that starts in `.` and names no path,
  when its fields are read,
  then they hold no path and no working folder.
- Given `uvx notes-server`,
  when its fields are read,
  then its registry is PyPI.
