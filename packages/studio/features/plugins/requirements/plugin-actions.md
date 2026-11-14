# plugins.plugin-actions

- Status: active
- Since: 0.1.0
- Source: HAL-1740; plugin screens design section 7 (HAL-1739); microcopy 24 T11 to T13 (HAL-751); UX acceptance checklist 6.2 and 6.5, fallbacks G4 and G8 (HAL-1952); Liam's decision on HAL-4540

The Studio shall give a plugin's page a ⋮ named "More actions for *name*" with Open panel when the plugin has a panel, Open folder, Remove trust while the plugin is trusted, and "Remove plugin…" in `danger`. Remove trust shall turn the plugin off at once, with no dialog. "Remove plugin…" shall ask first, with "Remove *name*?", a sentence that names only what the plugin adds ("Its tools, command, card and panel go away on this computer.") followed, when a connector in any workspace on this computer uses the plugin, by "The *connector* connector in *workspace* stops working until you add the plugin again." (and "Halonic couldn't check which connectors use it." when it can't tell), a sentence that names only what it keeps and is left out when it keeps nothing ("Its settings, sign-ins and the API key you entered are removed from this computer."), **Cancel** focused and **Remove plugin** in `danger`; after it's removed, the toast "*name* removed". When one of its secrets can't be deleted, the dialog shall stay open and name that secret. A plugin that can't load shall have **Check again**, which reads the plugins folder again, and **Open folder** under its problems. When an action fails, the Studio shall say "Couldn't *action*: *reason*." in a toast.

## Examples

- Given the Weather plugin is on and has a panel,
  when its ⋮ opens,
  then it lists Open panel, Open folder, Remove trust and Remove plugin….
- Given the Weather plugin isn't trusted yet,
  when its ⋮ opens,
  then it has no Remove trust.
- Given the Weather plugin has the setting "City" and the secret setting "API key",
  when the person picks Remove plugin…,
  then the dialog says "Its settings and the API key you entered are removed from this computer." and **Cancel** has the focus.
- Given the connector forecast in the workspace Acme uses the Weather plugin,
  when the person picks Remove plugin…,
  then the dialog also says "The forecast connector in Acme stops working until you add the plugin again."
- Given the same,
  when the person presses **Remove plugin**,
  then the plugin is removed and the toast says "Weather removed".
- Given the keychain can't delete the secret `api-key`,
  when the person presses **Remove plugin**,
  then the dialog stays open and says "Couldn't remove Weather: its secret api-key couldn't be deleted. The keychain is locked."
- Given removing trust fails with "The store is locked.",
  when the person picks Remove trust,
  then a toast says "Couldn't remove trust: the store is locked."
- Given the Weather plugin can't load,
  when the person presses **Check again**, then **Open folder**,
  then the plugins folder is read again and Weather's folder opens.
