# studio.desktop-plugins-host

- Status: active
- Since: 0.1.0
- Source: HAL-9377 (design check A4, HAL-9316)

The desktop app shall give the plugins feature a host built on core's `PluginService` over the shell's plugins folder, the profile's plugin records, the trust records the CLI shares and the keychain. Its feed shall list every plugin folder, a plugin that can't load by its folder's name with its problems, and shall tell its listeners only when a read finds something different. A read that fails shall keep the plugins the feed had. Trusting, removing trust, removing a plugin and Check again shall each read the folder again. The host shall add no plugin: adding stays a CLI action.

## Examples

- Given a trusted plugin, a new plugin and a folder whose manifest is broken,
  when the feed reads,
  then it lists them as on, not trusted and can't load, the last named by its folder.
- Given a feed that has read the plugins,
  when it reads again and nothing changed,
  then `current` gives the same array and no listener is called.
- Given a feed that has read the plugins,
  when the plugins folder can't be listed,
  then the read fails and `current` still gives the plugins it had.
- Given a plugin that isn't trusted,
  when the page's Trust action runs with the plugin's current fingerprint,
  then the feed says it is on.
