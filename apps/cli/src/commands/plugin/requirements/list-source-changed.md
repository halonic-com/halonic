# cli.commands.plugin.list-source-changed

- Status: active
- Since: unreleased
- Source: HAL-16319 (C696 finding 3 on HAL-16316)

When a plugin on `halonic plugin list` was added from a folder whose files, read as `halonic plugin add` reads a folder (`app.plugin-source-changes`), now differ from the plugin's copy, the command shall show a line under its row, marked with !, "The folder changed since this copy. To use your changes, run: halonic plugin add <folder> --update", with the folder as the source column writes it when a shell reads it back as it is, and else its full path as one shell word. A plugin added from a git address, or from a folder that is gone or can't be read or checked now, shall get no such line. With `--json`, each plugin shall give `sourceChanged`: `true` or `false` for a folder that can be read and checked, and `null` otherwise.

## Examples

- Given Weather added from `~/sources/weather`,
  when `backend/index.js` in `~/sources/weather` is edited and `halonic plugin list` is run,
  then under Weather's row it says "! The folder changed since this copy. To use your changes, run: halonic plugin add ~/sources/weather --update".
- Given the same plugin and an unedited folder, or one that only gained `.env`,
  when `halonic plugin list` is run,
  then there's no such line, and `--json` gives `"sourceChanged": false`.
