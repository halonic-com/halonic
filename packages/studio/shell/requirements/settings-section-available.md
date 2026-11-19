# shell.settings-section-available

- Status: active
- Since: unreleased
- Source: HAL-12241; tunnel phase B build plan, decision 19 (HAL-12232); shell.settings-without-host

Where a Settings section has `available`, the Studio window shall leave the section out until it says `true`: from the Settings dialog's list, from the phone's Settings list, from `openSettings(id)`, and from the `settingsSections` it gives features, so Ctrl K offers no command that opens it. When the section says `false` again, the window shall leave it out again. The window shall ask each such section once, with the context of the feature that added it, and shall stop it when the window goes. A section without `available` shall always show, as before.

## Examples

- Given the sections Appearance and Remote, where Remote has `available` and hasn't answered,
  when a feature reads the context's `settingsSections`,
  then it has Appearance and not Remote.
- Given the same window,
  when Remote says `true`,
  then the phone's Settings list has Remote, and when it says `false`, it doesn't.
- Given the same window,
  when it unmounts,
  then the function Remote's `available` gave back has been called once.
