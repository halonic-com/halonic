# workspace.trusted-sources

- Status: active
- Since: 0.1.0
- Source: flow-workspace 7, flow-settings 8, microcopy 4.6; HAL-646, HAL-8614, HAL-8685

The Workspace feature shall add the Settings section **Trusted sources** (`trusted-sources`, on this computer, after Assistant), which lists every trust record on this computer, most recently trusted first. A row shall show the folder's name, its location and "Trusted on *3 Nov 2026*", or "Folder not found" when the folder is gone; such a row stays until it is removed. **Remove** shall open "Remove trust from *inbox-helper*?" with **Cancel** focused and **Remove trust** in danger. Confirming shall delete the record, close the dialog, drop the row and say "Removed trust from *inbox-helper*" in the settings container's live region. When removing fails, the dialog shall stay open and say "Couldn't remove trust from *inbox-helper*: *reason*." With no records the section shall say "Nothing trusted yet. Halonic asks before running anything from a workspace, skill or connector you didn't create in Halonic." On the desktop it shall end with "Trust given with the `halonic` command is kept separately." In a browser served from another device it shall start with "View only here.", say "…on the computer running Halonic", and offer no **Remove**. While the records load it shall show skeleton bars and say "Loading trusted sources" to screen readers. When they can't be read it shall show "Couldn't load trusted sources", the reason and **Try again**.

## Examples

- Given records for inbox-helper (trusted 3 Nov) and pdf-tools (trusted 5 Nov),
  then pdf-tools is listed first.
- Given the person confirms **Remove trust** for inbox-helper and it works,
  then the row is gone and the live region says "Removed trust from inbox-helper".
- Given the records can't be read because the profile folder is locked,
  then the section says "Couldn't load trusted sources" with the reason and **Try again**.

## Not yet

Clicking a workspace row to open it waits for a window-level shell command that opens a workspace (HAL-8614 follow-up). Until then a row does nothing when clicked.
