# app.host-settings

- Status: active
- Since: 0.1.0
- Source: HAL-6159 (the settings host API, design on HAL-6159, reviewed on HAL-6216); the T11 spec on HAL-1294, sections 3 and 6 (an unreadable stored value silently starts from its default; a failed save keeps the old value; a section updates in place when the CLI or another window changes a setting)

The kernel shall have a `HostSettings` service over a `HostSettingsStore`. A host setting shall be defined by `hostSetting(key, fallback, accepts)`, which shall throw a `RangeError` for a key the store can't save or a fallback its own check refuses. After `load`, `get` shall give the saved value when it passes the setting's check, and otherwise the fallback, without an error; before a successful `load`, `get` shall throw. `load` shall pass on the store's error when the settings can't be read. `set` shall refuse a value the check refuses with a `RangeError` and save nothing; when the store's save fails, it shall throw and keep the value from before. It shall keep a copy of what it saved. `reset` shall put a setting back to its fallback by removing its saved value, in turn with saves; when the store's removal fails, it shall throw and keep the value from before.

From its first `load`, it shall watch the store, starting before the read so a change made during the load is seen, and stopping again when that first load fails, read again on a change, and call each `onChange` listener with the keys whose value changed, never for its own saves. Changes that come together shall be read once. A re-read that fails shall keep the values from before, call no listener and pass the error to the `onRefreshError` option, so the surface logs it. A listener that throws shall not keep the change from the others, a stopped listener shall not be called, and `close` shall stop the watch.

## Examples

- Given a saved turn limit of 0, 65, 2.5 or "16",
  when the turn limit is read,
  then it is 16.
- Given a loaded `HostSettings` with a turn limit of 20,
  when 65 is saved, or 24 is saved and the store fails,
  then it throws and the turn limit stays 20.
- Given a loaded `HostSettings` with a turn limit of 20,
  when the turn limit is reset,
  then it is 16 and the store holds no turn limit; when the store fails, it throws and stays 20.
- Given a store where another window saves a turn limit of 20 while it is read,
  when `HostSettings` loads,
  then the turn limit is 20 once the change is read.
- Given a listener,
  when this `HostSettings` saves a turn limit and the CLI then turns off connector tools,
  then the listener is called once, with `assistant.connector-tools`.
- Given a turn limit of 16 and a store that fails to read,
  when another window saves a turn limit of 20,
  then the turn limit stays 16, no listener is called and `onRefreshError` gets the error once.
- Given a closed `HostSettings`,
  when another window saves a turn limit,
  then it doesn't read again.
