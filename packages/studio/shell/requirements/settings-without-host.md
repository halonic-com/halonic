# shell.settings-without-host

- Status: active
- Since: unreleased
- Source: HAL-12552 (Liam's decision, option 1); HAL-6159 design, section 5; shell.settings-list-page

Where the Studio window is told that its place has no host settings yet (`withoutHostSettings`), the window shall leave out every section with `scope: "host"`: from the Settings dialog's list, from the phone's Settings list, from `openSettings(id)`, and from the `settingsSections` it gives features, so Ctrl K offers no command that opens one. A group left with no sections shall not be listed. Without it, the window shall list every section, as before.

## Examples

- Given the sections Appearance and Formats (`display`) and Assistant (`host`), on a served phone that has no host settings yet,
  when the user taps More, then Settings,
  then the list has "On this phone" with Appearance and Formats, and no "On your computer" group.
- Given the same window,
  when a view calls `openSettings("assistant")`,
  then the Settings list opens and no Assistant page does.
- Given the same window,
  when a feature reads the context's `settingsSections`,
  then it has Appearance and Formats, and not Assistant.
- Given a window that isn't told so,
  when the user opens Settings,
  then Assistant is listed under "On your computer".
