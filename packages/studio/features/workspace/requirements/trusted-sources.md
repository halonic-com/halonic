# workspace.trusted-sources

- Status: active
- Since: unreleased
- Source: flow-workspace 7, flow-settings 8, microcopy 4.6; HAL-646, HAL-8614, HAL-8685; HAL-14842 (full wording back after HAL-12409), HAL-14993, HAL-15116 (flow check C544)

The Workspace feature shall add the Settings section **Trusted sources** (`trusted-sources`, on this computer, after Assistant), which lists every trust record on this computer, most recently trusted first. A row shall show the folder's name with "Plugin" or "Workspace" beside it, its location and "Trusted on *3 Nov 2026*", or "Folder not found" when the folder is gone; such a row stays until it is removed. Each row's **Remove** shall be named "Remove trust from *inbox-helper*" for screen readers. **Remove** shall open "Remove trust from *inbox-helper*?" with **Cancel** focused and **Remove trust** in danger, saying "Halonic will ask again before running anything from this workspace, and runs in progress stop." for a workspace and "Its tools won't run until you trust it again." for a plugin. Confirming shall delete the record, for a plugin after signing it out (`app.plugin-sign-out`), close the dialog, drop the row and say "Removed trust from *inbox-helper*" in the settings container's live region, for a plugin "Removed trust from *weather* and signed it out". When a plugin's record is removed but its sign-out fails, the dialog shall stay open and say "Removed trust from *weather*, but couldn't sign it out: *reason*. Remove trust again to try the sign-out again.", and the row shall stay, saying "Trust removed, not signed out" in place of its date, until removing it again signs the plugin out. When removing fails, the dialog shall stay open and say "Couldn't remove trust from *inbox-helper*: *reason*." With no records the section shall say "Nothing trusted yet." On the desktop it shall end with "Trust given with the `halonic` command shows here too.", since Studio reads the same trust records as the command line (HAL-12642). In a browser served from another device it shall start with "View only here.", say "…on the computer running Halonic", and offer no **Remove**. While the records load it shall show skeleton bars and say "Loading trusted sources" to screen readers. When they can't be read it shall show "Couldn't load trusted sources", the reason and **Try again**.

## Examples

- Given records for inbox-helper (trusted 3 Nov) and pdf-tools (trusted 5 Nov),
  then pdf-tools is listed first.
- Given the person confirms **Remove trust** for inbox-helper and it works,
  then the row is gone and the live region says "Removed trust from inbox-helper".
- Given the person removes the weather plugin's trust and its sign-out fails,
  then the dialog says its trust was removed but it couldn't be signed out, the row says
  "Trust removed, not signed out", and **Remove trust** again tries the sign-out again.
- Given the records can't be read because the profile folder is locked,
  then the section says "Couldn't load trusted sources" with the reason and **Try again**.

## Not yet

Clicking a workspace row to open it waits for a window-level shell command that opens a workspace (HAL-8614 follow-up). Until then a row does nothing when clicked.
