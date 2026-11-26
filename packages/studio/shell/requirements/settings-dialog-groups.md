# shell.settings-dialog-groups

- Status: active
- Since: unreleased
- Source: HAL-19539 (board feedback on HAL-10, items on HAL-19536); plan approved by Liam on HAL-19539

The shell shall require every Settings section to name its group (`group`): `general`, `agents`, `connections`, `keyboard` or `about`. Where Settings opens in the desktop app, the shell shall list the sections in their groups, in the order General, Agents, Account and connections, Keyboard, About, and within a group by `order`. The shell shall draw no visible group heading: a 1px line in the border colour shall set each group but the first apart from the one above it. The shell shall mark each group as a `group` named for screen readers by its name ("General", "Agents", "Account and connections", "Keyboard", "About"). The shell shall leave out a group with no sections, and a workspace section when no workspace is open. The shell shall keep the headings by where values are saved in served Studio and the phone's list (`shell.settings-container`, `shell.settings-list-page`).

## Examples

- Given the workspace Acme is open, with Appearance (general), Models (agents), Remote (connections), Keyboard (keyboard) and About Halonic (about),
  when Settings opens in the desktop app,
  then the list shows them in that order, in five groups named General, Agents, Account and connections, Keyboard and About, with no heading drawn.
- Given Plugins (agents, order 60) and About Halonic (about, order 90),
  when Settings opens in the desktop app,
  then About Halonic is the last row.
- Given no workspace is open,
  when Settings opens in the desktop app,
  then Models isn't listed and the Agents group holds only the other sections.
- Given the desktop app's own features,
  when their sections are listed,
  then each names a group and an icon, and About Halonic comes last.
