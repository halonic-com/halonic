# ports.host-settings-store

- Status: active
- Since: 0.1.0
- Source: HAL-6159 (the settings host API, T11 PR 7; design on HAL-6159, reviewed on HAL-6216); the T11 spec on HAL-1294, section 6 (`settings.ai-agent.device-wide`: saved where Halonic runs, never written to any workspace file)

The ports package shall have a `HostSettingsStore` port that reads every saved host setting by key, saves one key's JSON value (`null` included), removes one key, and watches for changes made by anything, with a function that stops the watch. The port shall only store values: it shall have no method that knows a setting's meaning or default. It shall export `isHostSettingKey`, which allows only two or more words of lowercase letters and digits, each word starting with a letter and joined inside by single `-`, joined by `.`, at most 64 characters, and `hostSettingsMaxBytes`, 256 KiB of the values as compact JSON in UTF-8.

It shall export `readSavedHostSettings` and `changeSavedHostSettings`, which read and change the saved text `{ "version": 1, "values": {…} }` for adapters: text that isn't such an object reads as none saved and is marked broken when a save goes over it; a save keeps every other key, keys `isHostSettingKey` refuses, and every other field and the `version` of the text as they are; it refuses with a `RangeError` a key `isHostSettingKey` refuses, a number that isn't finite, and a saved value that would bring the values over `hostSettingsMaxBytes`; a removal shall never be refused for size, so settings already over it can be brought back under it. The cases in `packages/testing/contracts/src/golden/host-settings-limits.json` shall give the keys allowed and refused, the sizes that fit and don't, and the text read and saved, and the desktop shell's Rust side shall give the same answers for them.

The port's documentation shall state that the settings live in the user's profile and never in a workspace file, that a provider key is never one of them, that settings that can't be parsed read as none saved and are kept as a broken copy before the first save over them, that saves through one store run one at a time while between processes the last save wins, and that settings that can't be read make `read` throw.

## Examples

- Given the `HostSettingsStore` port,
  when its methods are read,
  then they are exactly `read`, `set`, `remove` and `watch`, and `watch` returns a stop function.
- Given `undefined`, a value with `undefined` inside it or a `Date`,
  when it is compiled as a `HostSettingValue`,
  then it doesn't compile, and `null` does.
- Given the golden keys,
  then `isHostSettingKey` allows `assistant.turn-limit` and refuses `turn-limit`, `__proto__.model` and one of 65 characters.
- Given instructions that bring the values to exactly 256 KiB, or one byte over in two-byte characters,
  then the first is saved and the second refused.
- Given saved settings already over 256 KiB,
  when a key is saved, or removed,
  then the save is refused and the removal isn't.
- Given the text of a newer version with a field and a key this version doesn't know,
  when the turn limit 24 is saved over it,
  then the text keeps that version, field and key, and isn't marked broken.
