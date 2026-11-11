# contracts.host-settings-store

- Status: active
- Since: 0.1.0
- Source: HAL-6159 (the settings host API); `HostSettingsStore` port v1; review on HAL-6216. Settings save by themselves one control at a time (HAL-1102), so a save changes one key

Where an adapter implements `HostSettingsStore`, it shall start empty and save one key's value without changing the others; `remove` shall remove a key, removing a key that isn't saved shall not be an error, and `null` shall be kept as a value. Twenty saves of different keys at once shall all be kept. It shall keep what was saved, whatever the caller later does with the objects it passed in or got back. For every saved case in the port's golden cases, it shall read the text as the case's values, or none saved, and after saving the turn limit 24 hold the case's text after the save; unparsable text shall be kept as the broken copy, replacing an older one, and parsable text shall leave the broken copy as it is. It shall refuse with a `RangeError`, and save nothing, every golden key the port refuses, for `set` and `remove`, a number that isn't finite anywhere in the value, and every golden size that doesn't fit, and it shall save every golden size that fits. It shall call each watcher after its own saves and after a change made through another store, and never call a watcher after it was stopped.

## Examples

- Given a turn limit of 20 and an assistant model,
  when the turn limit is saved as 24,
  then `read` gives the turn limit 24 and the same model.
- Given twenty saves of twenty keys started together,
  when they are done,
  then `read` gives all twenty.
- Given a saved file cut off halfway,
  when the turn limit 24 is saved,
  then `read` had given none saved, the file holds only the turn limit and the broken copy holds the cut-off text.
- Given the keys `turn-limit`, `__proto__.model` and `../host.json`,
  when each is saved or removed,
  then each is refused with a `RangeError` and nothing is saved.
- Given a watcher,
  when another store saves a turn limit of 32,
  then the watcher is called and `read` gives 32.
