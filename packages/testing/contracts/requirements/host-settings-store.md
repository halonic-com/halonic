# contracts.host-settings-store

- Status: active
- Since: 0.1.0
- Source: HAL-6159 (the settings host API); `HostSettingsStore` port v1. Settings save by themselves one control at a time (HAL-1102), so a save changes one key

Where an adapter implements `HostSettingsStore`, it shall start empty and save one key's value without changing the others; saving `undefined` shall remove the key, and removing a key that isn't saved shall not be an error. It shall keep what was saved, whatever the caller later does with the objects it passed in or got back. Settings that can't be parsed shall read as none saved, and the next save shall write only the new value. It shall refuse with a `RangeError`, and save nothing, a key `isHostSettingKey` refuses, a number that isn't finite anywhere in the value, and a value that takes the settings over `hostSettingsMaxBytes`. It shall call each watcher after its own saves and after a change made through another store, and never call a watcher after it was stopped.

## Examples

- Given a turn limit of 20 and an assistant model,
  when the turn limit is saved as 24,
  then `read` gives the turn limit 24 and the same model.
- Given the keys `turn-limit`, `__proto__.polluted` and `../host.json`,
  when each is saved,
  then each is refused with a `RangeError` and `read` gives an empty object.
- Given a turn limit of 20,
  when `NaN` or instructions of 256 KiB are saved,
  then they are refused with a `RangeError` and the turn limit 20 is kept.
- Given a watcher,
  when another store saves a turn limit of 32,
  then the watcher is called and `read` gives 32.
