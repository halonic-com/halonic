# workspace.local-only-sheet-hosts

- Status: active
- Since: unreleased
- Source: HAL-14300 (C42 of HAL-14271, HAL-5922, ADR `docs/adr/2026-11-08-local-first.md`); `run` reading the sheets of the version it starts is HAL-14860

When `loadWorkspace` is given the hosts of the installed plugins' backends and of the local integrations' sheets, and the workspace sets `privacy.localOnly: true`, the workspace package shall count a `plugin` or `integration` connector as local only when its own `local` key says `true` and its sheet is among those given and lists no host outside this computer and its network. A host is outside when it is a fixed host, whatever its name (the runner sends a name only to a public address), or a `{ fromSetting }` host of class `public`. Such a connector that isn't local gets an error naming the plugin or the integration and every outside host, ending with `set privacy.localOnly: false in workspace.yaml to use it`, and never the `local: true` hint a program or an address gets. `halonic validate`, `halonic run` before it starts anything, and the CLI's run connectors in a local-only run make the same decision with the same hosts, so a connector `validate` refuses is never started or called by a local-only run. `halonic run` shall read the local integrations' sheets from the files the run uses, the live version when the workspace has history, as its run connectors do, so a sheet saved but not made live changes neither decision.

## Examples

- Given `privacy.localOnly: true`, a connector with `local: true` to the plugin `acme-orders`, whose backend lists `api.acme.example`, when `halonic validate` runs, then it fails with `The plugin acme-orders reaches api.acme.example, so it isn't local: set privacy.localOnly: false in workspace.yaml to use it` at the connector's `local` key, and `halonic run` refuses the workspace before trust with `Acme has 1 problem in its files. Nothing ran.`
- Given the same plugin listing only `orders.localhost`, when `halonic validate` runs, then it fails with `The plugin acme-orders reaches orders.localhost, …`: a fixed host never reaches this computer.
- Given the same plugin listing no hosts, when `halonic validate` runs, then it finds no problems.
- Given a local integration whose sheet lists a `public` host from its `server` setting, when it is loaded, then the error says `The integration in integrations/notes reaches the address in its server setting`.
- Given a plugin connector with `local: true` whose plugin isn't installed, when it is loaded with the hosts, then it isn't local and the error is `Connector "orders" isn't local, and the workspace is local only: set privacy.localOnly: false in workspace.yaml to use it`.
- Given a local-only run whose hub has a `local: true` connector to a plugin that reaches `api.acme.example`, when the run's connectors start, then that connector isn't started and the run never calls it.
- Given a local-only workspace whose live version has a `local: true` connector to the integration in `integrations/station`, whose sheet lists `api.station.example`, and that sheet saved since with no hosts but not made live, when `halonic run` loads the workspace, then it has the error `The integration in integrations/station reaches api.station.example, …`; and with the two sheets the other way round, it has no such error.
