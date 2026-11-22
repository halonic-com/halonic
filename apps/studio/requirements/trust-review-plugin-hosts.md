# studio.trust-review-plugin-hosts

- Status: active
- Since: unreleased
- Source: HAL-15123, from Iris's flow check C544 (HAL-15101), item 2; the same content as `halonic trust` (`cli.trust-check`, HAL-14860), decided by the team

When the Studio's workspace trust check (`studio.workspace-trust-review`) shows a plugin connector under Addresses, its row shall name the plugin, "plugin acme-orders", as `halonic trust` does. When that plugin is installed and may reach hosts, a line "Reaches" under the row shall list them, each as the manifest writes it or, for a host taken from a setting, as "the address in the setting region-url". They are the hosts the format's `pluginHosts` gives, as `halonic trust` lists them: its backend's hosts, then each local tool's `network` sites not listed yet (HAL-15705). The hosts come from the installed plugins' manifests, which the plugin's own trust check covered, so they don't change the workspace's fingerprint. When the installed plugins are read again, the check shall be built again and the window told.

## Examples

- Given a connector `orders` with `transport: { plugin: { id: acme-orders } }` and the plugin `acme-orders` installed with the hosts `api.acme.example` and `{ fromSetting: region-url }`,
  when the trust check is shown,
  then the row `orders` says "plugin acme-orders" with the line "Reaches: api.acme.example and the address in the setting region-url".
- Given the same connector and the plugin `acme-orders` installed with no backend and two local tools, one with the `network` site `files.acme.example` and one with `files.acme.example` and `mirror.acme.example`,
  when the trust check is shown,
  then the row says "plugin acme-orders" with the line "Reaches: files.acme.example and mirror.acme.example".
- Given the plugin with the backend hosts above and a local tool with the `network` site `files.acme.example`,
  when the trust check is shown,
  then the line is "Reaches: api.acme.example, the address in the setting region-url and files.acme.example".
- Given the same connector and no plugin installed,
  when the trust check is shown,
  then the row says "plugin acme-orders" with no Reaches line.
- Given the check shown before the plugins were read,
  when the plugins are read,
  then the window is told and the check has the Reaches line.
