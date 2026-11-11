# ports.host-settings-store

- Status: active
- Since: 0.1.0
- Source: HAL-6159 (the settings host API, T11 PR 7; design on HAL-6159); the T11 spec on HAL-1294, section 6 (`settings.ai-agent.device-wide`: saved where Halonic runs, never written to any workspace file)

The ports package shall have a `HostSettingsStore` port that reads every saved host setting by key, saves or removes one key's JSON value, and watches for changes made by anything, with a function that stops the watch. The port shall only store values: it shall have no method that knows a setting's meaning or default. It shall export `isHostSettingKey`, which allows only two or more words of lowercase letters and digits, each word starting with a letter and joined inside by single `-`, joined by `.`, at most 64 characters, and `hostSettingsMaxBytes`, 256 KiB.

The port's documentation shall state that the settings live in the user's profile and never in a workspace file, that a provider key is never one of them, that settings that can't be parsed read as none saved, and that settings that can't be read make `read` throw.

## Examples

- Given the `HostSettingsStore` port,
  when its methods are read,
  then they are exactly `read`, `set` and `watch`, and `watch` returns a stop function.
- Given a value with `undefined` inside it or a `Date`,
  when it is compiled as a `HostSettingValue`,
  then it doesn't compile.
- Given the keys `assistant.turn-limit` and `sandbox.new-agents`,
  then `isHostSettingKey` allows them.
- Given the keys `turn-limit`, `Assistant.model`, `assistant.turn_limit`, `__proto__.model` and one of 65 characters,
  then `isHostSettingKey` refuses them.
