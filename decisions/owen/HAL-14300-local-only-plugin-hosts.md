# Decision: `privacy.localOnly` counts the hosts of a plugin's or local integration's sheet

- Approval: Paperclip task HAL-14300 (C42 of HAL-14271); Liam decided it is a security change, and Julian reviews and signs this note
- Kind: user-visible

## What changes

A `plugin` or `integration` connector counts as local only when its `local` key says `true` and the
sheet of its code (the plugin's `backend.hosts`, or the integration's `hosts`) lists no host outside
this computer and its network. Every fixed host is outside, whatever its name looks like: the
runner sends a name only to a public address, so `*.localhost` and `127.*` names never reach this
computer. A `{ fromSetting }` host of class `public` is outside too. Only `loopback` and `private`
setting hosts, whose addresses the runner checks on every request, stay local, as `local: true`
means "this computer or your own network"; so does a sheet with no hosts.

- `halonic validate` and `halonic run` read the installed plugins and the local integrations and
  report `The plugin acme-orders reaches api.acme.example, so it isn't local: set
  privacy.localOnly: false in workspace.yaml to use it` at the connector's `local` key. `run`
  refuses the workspace before trust, as for any file problem.
- The CLI's run connectors make the same decision in a local-only run, with the hosts read from
  the run's program folder and the profile, so the engine never gets such a connector marked
  `local` (`engine.local-only` then leaves it out).
- With the hosts given, a plugin that isn't installed or can't be read isn't local either.
- The `local-only-connector` message no longer offers `local: true` for these two transports: it
  only says how to turn local-only off.

## Why

`local: true` is the workspace author's statement, but for a plugin or an integration the code
that runs goes where its sheet says. The local-only promise should follow the sheet the person
trusted, not a key in a connector file.

## Covers

- format.connector-is-local
- format.connector-runner-transports
