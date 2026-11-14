# shell.settings-saved-line

- Status: active
- Since: 0.1.0
- Source: HAL-1294 (T11); flow-settings 5 and 6 (HAL-646); g5-frames T11-F13 and F16 (HAL-1143)

The shell shall say, under the name of a `display` settings section, where its values are saved: "Saved on this computer, for every workspace." in the desktop app, and "Saved in this browser. The computer running Halonic keeps its own." in a browser, and "Saved on this phone. Your computer keeps its own." on the phone's Settings page. A `workspace` or `host` section shall have no such line from the shell. The shell shall tell each section's view whether it shows in the desktop app or in a browser.

## Examples

- Given Settings opens on Appearance (display),
  when it shows in the desktop app,
  then "Saved on this computer, for every workspace." shows under "Appearance".
- Given Settings opens on Appearance (display),
  when it shows in a browser,
  then "Saved in this browser. The computer running Halonic keeps its own." shows under "Appearance".
- Given Settings opens on Appearance (display),
  when it shows on the phone's Settings page,
  then "Saved on this phone. Your computer keeps its own." shows under "Appearance".
- Given Settings opens on Assistant (host),
  when it shows,
  then no "Saved …" line shows under "Assistant".
