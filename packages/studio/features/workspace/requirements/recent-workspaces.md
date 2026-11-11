# workspace.recent-workspaces

- Status: active
- Since: 0.1.0
- Source: req-workspace `workspace.switcher.recent-workspaces` (HAL-110), flow-workspace 2.1; HAL-1291

The workspace switcher shall remember on this device the last 9 workspaces shown, most recent first, with each one's latest name, across restarts. If the remembered list can't be read, then it shall count as empty, and if it can't be written, then it shall stay as it was, so Recent never stops a workspace from opening. **Remove from Recent** shall forget a workspace.

## Examples

- Given the user opened "Acme", then "Beta", then switched back to "Acme", and closed the app,
  when the app starts again,
  then the remembered list is "Acme", "Beta".
- Given 10 different workspaces were shown, then only the 9 most recent are remembered.
