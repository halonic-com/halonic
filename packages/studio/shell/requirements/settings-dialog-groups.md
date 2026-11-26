# shell.settings-dialog-groups

- Status: active
- Since: unreleased
- Source: HAL-19539 (board feedback on HAL-10, items on HAL-19536); plan approved by Liam on HAL-19539

Every Settings section shall name its group (`group`): `general`, `agents`, `connections`, `keyboard` or `about`. In the desktop app's Settings dialog, the shell shall list the sections in their groups, in the order General, Agents, Account and connections, Keyboard, About, and within a group by `order`. A group shall have no visible heading: a 1px line in the border colour shall set each group but the first apart from the one above it. Each group shall be a `group` named for screen readers by its name ("General", "Agents", "Account and connections", "Keyboard", "About"). A group with no sections shall be left out, and so shall a workspace section when no workspace is open. Served Studio and the phone's list shall keep their headings by where values are saved (`shell.settings-container`, `shell.settings-list-page`).

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
