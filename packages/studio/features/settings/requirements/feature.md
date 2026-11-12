# settings.feature

- Status: active
- Since: 0.1.0
- Source: HAL-7279 (T11 PR 10); flow-settings 2 (HAL-646)

The Settings feature shall add each section in its list of sections to Settings through the shell's `settings` contribution point, and shall add the command **Settings**, `settings.open`, which opens Settings through the window's `openSettings` without asking for a section.

## Examples

- Given the feature's list holds the section `agent-sandbox`,
  when the shell starts with the feature,
  then the shell's settings list holds `agent-sandbox`.
- Given the Studio window with the feature,
  when the user runs **Settings** from Ctrl K,
  then Settings opens.
