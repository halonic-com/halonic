# Decision: the desktop app's Settings list groups sections by topic, About Halonic last

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19539 (board feedback on HAL-10, items on HAL-19536; Liam approved the plan and its groups on HAL-19539)
- Kind: user-visible

The board asked for the Settings menu in logical groups, with About Halonic last and an icon on every
item. In the desktop app's Settings dialog the sections are now grouped by what they are about (new
requirement `shell.settings-dialog-groups`): General, Agents, Account and connections, Keyboard, About.
Hairlines set the groups apart instead of headings, and each group is a named `group` for screen readers.
Served Studio and the phone's list keep their headings by where values are saved, because there the
heading says whether a value is kept in the browser or on the computer.

- `shell.settings-container` no longer says the desktop app shows "Acme, Workspace settings" and "On this
  computer" headings; it points to the new requirement. Its browser behaviour is unchanged. Its first
  example is now the browser's, and the no-workspace example no longer mentions a heading.
- `studio.settings` said the desktop app lists a `host` or `display` section under "On this computer"; it
  now says each section is listed in its group, and its example finds Agent sandbox in the Agents group.
- `kit.section-icon` lists the four new icons: Connections, Notifications, Feedback and Keyboard (and
  Server session, which already had one).
- The tests of `studio.settings`, `shell.settings-container`, `shell.settings-keyboard` and `shell.settings-window` that read
  the desktop dialog's old headings or row order now read its named groups and the new row order. The
  browser and phone cases keep their assertions, and the new groups have tests of their own.

## Covers

- shell.settings-container
- shell.settings-keyboard
- shell.settings-window
- studio.settings
- kit.section-icon
