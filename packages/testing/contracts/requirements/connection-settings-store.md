# contracts.connection-settings-store

- Status: active
- Since: 0.1.0
- Source: HAL-2598, from HAL-181 (a contract suite for every port before its adapters); `ConnectionSettingsStore` port v1. The store decides whether a connector may send, so it fails closed

Where an adapter implements `ConnectionSettingsStore`, it shall give back every field of saved settings and `null` for a key it has no settings for. Saving the same key again shall replace the settings, and removing shall delete them; removing a key without settings shall not be an error. It shall keep settings per location and connector id, compare both exactly as given (no case folding, trimming or Unicode normalisation), and never let two different keys share settings, whatever characters they hold. It shall keep what was saved, whatever the caller later does with the objects it passed in or got back. When stored settings can't be read, `get` for that key shall reject with an error that names the location and the connector and holds none of the settings' contents in its message or causes, while other keys still read; `remove` shall delete those settings, and saving the key again shall replace them.

## Examples

- Given settings for `mail` in `/workspaces/acme` with sending allowed,
  when the same key is saved with sending not allowed,
  then `get` gives the new settings.
- Given settings for `mail` in `/workspaces/acme`,
  when `mail` in `/workspaces/zeta`, `docs` in `/workspaces/acme`, `mail` in `/workspaces/acme/` or `Mail` in `/workspaces/acme` is read,
  then it gives `null`.
- Given settings for `mail:send` in `/workspaces/acme`,
  when `send` in `/workspaces/acme:mail` is read,
  then it gives `null`, and saving it keeps both.
- Given settings for `mail` in `/workspaces/acme` that were read,
  when the caller changes `allowSending` on the object it got back,
  then the next `get` still gives the stored value.
- Given settings for `mail` in `/workspaces/acme` and `/workspaces/zeta`, and the first can't be read,
  when `get` is called for the first,
  then it rejects with an error naming `mail` and `/workspaces/acme` but not the time it was changed, and the second still reads.
- Given settings that can't be read,
  when they are removed,
  then `get` gives `null`.
