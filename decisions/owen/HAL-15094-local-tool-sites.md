# Decision: `privacy.localOnly` counts a plugin's local tool sites

- Approval: Paperclip task HAL-15094 (Liam signed off the task's recommendation when he routed it)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:QApv7NRj/LbubKplrxo1s1cRXfvF9cnVXRIOMHbB8rfoZcP1Oz4JIRV3yUZXB5EHllJWOcEZb/l3w/e35t9zBw==

## What changes

1. **A plugin's hosts are its backend's `hosts` and every local tool's `network` sites.** The list
   `privacy.localOnly` counts for a `plugin` connector (`SheetHosts.plugins`) now holds both, each
   host once, backend hosts first. A local tool's sites are always outside this computer (a
   `network` entry may not name an address, `localhost` or a local-network name), so a plugin whose
   local tool reaches a site isn't local: `halonic validate` fails with
   `The plugin acme-orders reaches api.acme.example, …`, `halonic run` refuses the workspace before
   trust, and a local-only run's connectors leave it out.
2. **A plugin with only local tools is in the list too.** Before, a plugin with no backend was left
   out, so a connector to it was never local, even when it reaches nothing. Now such a plugin's list
   holds its local tools' sites, and one with none counts as local. A plugin that can't be read or
   checked is still left out, so a connector to it still isn't local.
3. **The trust check shows the same list.** A plugin connector's `Reaches …` line in `halonic trust`
   and in every command refused with exit code 3 reads this list, so it names the local tools' sites
   too. Studio's trust check already listed them.

## Why

Local-only promises that a run uses only local models and connectors. A trusted plugin whose backend
listed no hosts but whose local tool could reach a public site counted as local, so its tool
started in a local-only run and could reach that site. Item 2 is the other side of the same list: a
plugin that reaches nothing should count as local whatever parts it has. HAL-13056's fence test can
turn local-only back on once this lands.

## Covers

- workspace.local-only-sheet-hosts
