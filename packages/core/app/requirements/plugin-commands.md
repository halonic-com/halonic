# app.plugin-commands

- Status: active
- Since: 0.1.0
- Source: HAL-1736 and HAL-6653 (plugins P3): "the same operations offered to Studio through `PluginService` commands"

The app shall offer `halonic plugin`'s operations on a workspace's command bus, so Studio and the CLI run them through the same `PluginService` calls: `plugins.list` gives every plugin with its trust status, `plugins.add` adds a plugin from a folder reader and its source, `plugins.trust` trusts it only when the fingerprint is still exactly its own and records the trust as given at a trust check, `plugins.revoke` turns it off by forgetting its trust, and `plugins.remove` removes it with its trust, secrets and settings through the host's secret writer. Registering them shall give back a function that removes the handlers again, and when one of them already has a handler on the bus it shall throw and leave the bus as it was.

## Examples

- Given a workspace's bus with the plugin commands,
  when the weather plugin is added, trusted with its fingerprint, turned off and removed through them,
  then `plugins.list` shows it new, trusted, new again and then not at all, and its secrets were deleted.
- Given a bus where `plugins.remove` already has a handler,
  when the plugin commands are registered,
  then it throws and `plugins.list` has no handler.
