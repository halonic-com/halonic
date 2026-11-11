# cli.commands.trust.changes-json

- Status: active
- Since: 0.1.0
- Source: HAL-188 build plan, item 10b ("`--json` returns the same changes as data"); field names decided by the team on HAL-188 (HAL-2282)

When the workspace was trusted on this computer before and has changed since, the `halonic trust [--dir <folder>] --json` command shall give what changed as a `changes` object: `trustedAt`, the ISO time of the earlier trust, and for `connectors`, `agents`, `integrations` and `providers` the ids that are `added`, the ids that `changed` with the sorted names of the `fields` that differ, and the ids that are `removed`. It shall be in `error.changes` when the command refuses with exit 3, and in `changes` when `--yes --fingerprint` trusts the changed workspace. A workspace that was never trusted shall have no `changes`. The values of the fields shall not be in it.

## Examples

- Given Acme, trusted with the connector `mail`, and then a connector `notes` added,
  when `halonic trust --dir acme --json` runs,
  then it exits with 3 and `error.changes` is `{ "trustedAt": "2026-11-03T12:00:00.000Z", "connectors": { "added": ["notes"], "changed": [], "removed": [] }, … }`.
- Given the same Acme and its current fingerprint,
  when `halonic trust --dir acme --yes --fingerprint <fingerprint> --json` runs,
  then it exits with 0, its `status` is `trusted` and its `changes.connectors.added` is `["notes"]`.
- Given Acme, never trusted,
  when `halonic trust --dir acme --json` runs,
  then `error` has no `changes`.
