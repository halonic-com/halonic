# app.plugin-remove

- Status: active
- Since: 0.1.0
- Source: HAL-1736 (plugins P3) plan, "How remove works" and PR 4; comments on HAL-1736 from HAL-1735: revoke before the folder is gone (halonic#1440), skip revoke for a link (Liam's review of halonic#1440), delete the plugin's own secret names (Liam's decision on HAL-4540); approved CLI wording 3.6 on HAL-1981 ("Removes the plugin and its settings and secrets")

The app's `PluginService` shall remove a plugin by its id, for the CLI and Studio alike, in this order: forget its trust when its entry in the plugins folder is a real folder, and never for a link; delete, with the host's secret writer, every secret name the plugin declares now and every one its install record kept; delete its settings and its install record; and remove its entry through the `PluginFolderWriter` port, a link itself and never what it points to. When a secret can't be deleted, it shall stop, keep the folder, the settings and the install record, and give the secret's declared name and the writer's reason, never a value, so removing it again finishes the job. It shall remove only the entry with exactly the id, do nothing to the plugins folder when there is none, and refuse an id that isn't a single folder name before touching anything.

## Examples

- Given the weather plugin added, trusted and with saved settings,
  when it is removed,
  then its folder, trust record, settings, install record and both stored secret names are gone, and adding it again shows it as new.
- Given deleting `acme-key` fails,
  when the weather plugin is removed,
  then it is refused naming `acme-key`, the folder, settings and install record are kept; and removing it again finishes.
- Given the weather plugin's entry is a link,
  when it is removed,
  then its trust isn't revoked, the secret names from its install record are deleted and the link is gone.
- Given the weather plugin's manifest can't be read any more,
  when it is removed,
  then the secret names from its install record are deleted and the folder is gone.
- Given the plugin now declares a secret it didn't declare when it was added,
  when it is removed,
  then that secret is deleted too.
- Given only `weather` is added,
  when `Weather` or `rain` is removed,
  then nothing changes.
- Given the id `../weather`,
  when it is removed,
  then it is refused with a `RangeError` and nothing is deleted.
