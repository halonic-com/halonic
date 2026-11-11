# cli.local-integrations

- Status: active
- Since: 0.1.0
- Source: HAL-5181, items 3a and 8a of the HAL-188 build plan; the runner start's trust check is `app.trusted-runner-start` (HAL-983)

When a command checks a workspace's trust, the `halonic` command shall read as local integrations every folder directly under `integrations/` that holds an `integration.yaml`, each hashed as a runner start hashes it and with no settings, so a `{ fromSetting }` host shows as `not set`; it shall leave out a folder that can't be read as an integration and a folder whose id an earlier one already has. When a trusted local integration's files changed, the trust check shall show it under Addresses as one `code changed` row tagged Changed, without naming the files, and when it moved, one row with its folder before and after. When a workspace with a local integration isn't trusted, `halonic run` shall exit with code 3 and no runner of the integration shall start.

## Examples

- Given Acme with `integrations/station/integration.yaml` and `integrations/notes/` without one,
  when its local integrations are read,
  then only station is read, with no settings and the code hash its runner start checks.
- Given Acme with the station integration reading the setting station_url,
  when its trust check is made,
  then station's row under Addresses says station_url is `not set`.
- Given Acme trusted with the station integration, and one of its files changed since,
  when its trust check is made,
  then it says "1 changed address since you trusted this on 11 Nov." and shows `station  code changed  Changed`, and the station's runner doesn't start, even with the trust check made before the change.
- Given Acme on the test model with the station integration, never trusted,
  when `halonic run support-reply` runs,
  then it exits with code 3 and the station's runner doesn't start.
