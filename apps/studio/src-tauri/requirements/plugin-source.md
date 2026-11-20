# studio.src-tauri.plugin-source

- Status: draft
- Since: unreleased
- Source: HAL-11571; `app.plugin-add`; `studio.src-tauri.plugin-folder-place`; HAL-13713 (a pick that holds the profile)

When the page calls `plugin_source_pick`, the shell shall show the computer's folder picker and keep the folder the person picks, as its real path, in the shell's memory for this session, and shall answer its location, or `null` when they pick nothing. The shell shall refuse a pick that is the Halonic profile folder or the plugins folder, holds either or is inside either, compared by its real path, so a link into the profile is refused too. When the page calls `plugin_source_entries` or `plugin_source_read`, the shell shall work only in a folder picked in this session, named by the location the pick answered, and shall refuse any other location, a typed path included, as `source_not_picked`. If a picked folder has since been swapped for a link, then the shell shall refuse it too. The shell shall list and read the folder as it lists and reads a plugin's folder: it follows no link, opens no special file, leaves out the `.git` folder at the top, leaves out the profile when the folder holds it, lists at most the entries a plugin may have and one more, and refuses a file larger than a plugin may be. Only the local main window shall be granted the commands, in a capability of their own, and they shall write nothing.

## Examples

- Given a picked folder holding `plugin.yaml`, `src/index.js` and a `.git` folder,
  when the page lists it,
  then it sees `plugin.yaml`, `src` and `src/index.js`, and reading `.git/HEAD` finds nothing.
- Given a path the person never picked, such as `~/.ssh`,
  when the page reads from it,
  then the shell refuses it as `source_not_picked`.
- Given the person picks the plugins folder, the folder that holds the profile, or a link to a folder inside the profile,
  when the shell checks the pick,
  then it is refused as `source_not_allowed` and nothing is kept.
- Given a picked folder with a link to a file outside it,
  when the page reads the link,
  then the shell refuses it and never opens what it points at.
