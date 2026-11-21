# Decision: the trust check shows a plugin connector's hosts, and `run` reads the live version's integration sheets

- Approval: Paperclip task HAL-14860 (follow-up of HAL-14300, asked for by Liam when he approved halonic#4204)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:WmWhmAFe8/AU1ObEfECh9ufpOl1oXntTlhAUYPIPGafpAZix2nguB6rb7Sy1xEVs+KVlAr5EINvi7szjmClNCw==

## What changes

1. **The trust check names a plugin connector's plugin and its hosts.** Under Addresses, a connector
   to a plugin now reads `orders        plugin acme-orders` instead of `orders        plugin`. When
   that plugin is installed on this computer and its backend lists hosts, a line under it says
   `Reaches api.acme.example and the address in the setting region_url.`, each host once and
   escaped. The hosts come from the installed plugin's manifest, the same list `privacy.localOnly`
   counts since HAL-14300. They are shown, not fingerprinted: the plugin's own trust check
   (`halonic plugin add`) covers its manifest, and a workspace's fingerprint stays the same on every
   computer whatever plugins are installed, so no trusted workspace asks again after this change.
   `halonic trust` and every command refused with exit code 3 show the line.
2. **`halonic run` reads the local integrations' sheets from the version it starts.** Before trust,
   `run` checks `privacy.localOnly` with the hosts of the integration sheets in the live version
   (or the saved files with history off), the same files its run connectors read. Before, it read
   the sheets in the working folder, so a sheet saved but not made live could make `run` refuse a
   connector its run would allow, or pass one its run connectors would then leave out.

## Why

Item 1: the trust check said `plugin` and nothing about where the plugin's code goes, though
`privacy.localOnly` already decides on those hosts. Item 2: `run`'s pre-trust check and its run
connectors should decide on the same sheets, as `workspace.local-only-sheet-hosts` says.

The wording (`plugin <id>`, `Reaches …`) is the team's call under HAL-2282: it reuses the plugin
trust check's host wording and the provider row's line under a row.

## Covers

- cli.trust-check
- workspace.local-only-sheet-hosts
