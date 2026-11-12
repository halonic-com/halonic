# studio.window-appearance

- Status: active
- Since: 0.1.0
- Source: HAL-1294 (T11); HAL-7216; flow-settings 5 (HAL-646)

The desktop app shall give every workspace in a window the same display settings, saved on this computer, and show their Appearance on the whole window (`settings.appearance-section`) from the moment it starts until it stops. On a page with no storage a save shall fail, so Settings says so and puts the value back.

## Examples

- Given a page with no storage,
  when the user picks Dark,
  then the save fails and the theme stays System.

- Given the desktop app, with the theme Dark saved on this computer,
  when it starts,
  then the window shows the Dark theme.
