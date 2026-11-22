# studio.trust-review-program-fields

- Status: active
- Since: unreleased
- Source: HAL-16323: Studio's trust check shows the same fields of a program as the CLI's (`cli.trust-check`, `cli.trust-check-working-folder`), from one builder (`app.program-trust-fields`)

The desktop app's trust check shall show, for each program, the fields the CLI's trust check shows: its command and arguments, the secrets it gets and the variables it takes from the person's environment, then **Resolved path** when its command was found, **Working folder** when it starts in a folder other than the workspace's own, and **Environment** with each of its own `env` entries as `NAME=value`, one per line, in name order. Where integrations run in the sandbox on this computer, it shall then show **Allowed sites** with each site the program may reach there, and count them as sites in the summary; elsewhere it shall show and count none. A new or changed program shall show the same lines.

## Examples

- Given a program `node files.js` found at `/usr/local/bin/node`, starting in `tools`, with the `env` entries `NODE_OPTIONS` and `LOG_LEVEL`,
  when its check opens,
  then its row reads **Resolved path** `/usr/local/bin/node`, **Working folder** `tools`, **Environment** `LOG_LEVEL=debug` and `NODE_OPTIONS=--require ./setup.js` under it.
- Given that program names the site pypi.org and integrations run in the sandbox,
  when its check opens,
  then its row also reads **Allowed sites** `pypi.org`, and the summary says it will allow 1 site.
- Given the same program where integrations don't run in the sandbox,
  when its check opens,
  then its row shows no site.
- Given a trusted program whose `env` entry changed,
  when its check opens,
  then its Changed row shows the new entry.
