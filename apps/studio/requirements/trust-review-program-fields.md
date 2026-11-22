# studio.trust-review-program-fields

- Status: active
- Since: unreleased
- Source: HAL-16323: Studio's trust check shows the same fields of a program as the CLI's (`cli.trust-check`, `cli.trust-check-working-folder`), from one builder (`app.program-trust-fields`); HAL-16420 (C706 rows 3 and 4): the path's label is **Runs** (microcopy 4.3), and the values are code; HAL-16516 (C716 row 2): the secrets' names too, as the env var names they are

The desktop app's trust check shall show, for each program, the fields the CLI's trust check shows: its command and arguments, the secrets it gets and the variables it takes from the person's environment, then **Runs** with the path it runs when its command was found, **Working folder** when it starts in a folder other than the workspace's own, and **Environment** with each of its own `env` entries as `NAME=value`, one per line, in name order. It shall mark these values, the names of the secrets it gets and the names it takes from the environment as code, so they show in mono. Where integrations run in the sandbox on this computer, it shall then show **Allowed sites** with each site the program may reach there, and count them as sites in the summary; elsewhere it shall show and count none. A new or changed program shall show the same lines.

## Examples

- Given a program `node files.js` found at `/usr/local/bin/node`, starting in `tools`, with the `env` entries `NODE_OPTIONS` and `LOG_LEVEL`,
  when its check opens,
  then its row reads **Runs** `/usr/local/bin/node`, **Working folder** `tools`, **Environment** `LOG_LEVEL=debug` and `NODE_OPTIONS=--require ./setup.js` under it.
- Given that program names the site pypi.org and integrations run in the sandbox,
  when its check opens,
  then its row also reads **Allowed sites** `pypi.org`, and the summary says it will allow 1 site.
- Given the same program where integrations don't run in the sandbox,
  when its check opens,
  then its row shows no site.
- Given a trusted program whose `env` entry changed,
  when its check opens,
  then its Changed row shows the new entry.
