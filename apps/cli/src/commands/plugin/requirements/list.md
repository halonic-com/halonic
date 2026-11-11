# cli.commands.plugin.list

- Status: active
- Since: 0.1.0
- Source: HAL-1736 (P3, plugin list); cli-output 3.6, approved on HAL-2123

The `halonic plugin list` command, which is also what `halonic plugin` does on its own, shall list every plugin in the profile's plugins folder, one line per plugin with four columns lined up: the plugin's name, its version, where it was added from and whether it is on. A git source shall be shown as its address without the scheme and `.git`, then `@` and the first seven characters of the commit; a folder shall be shown as its path, with the home folder written as `~`. A plugin that is trusted shall say "on" with ✓; one never trusted shall say "not trusted yet", and one that changed since it was trusted shall say "changed since you trusted it", each with ! and the `halonic trust --plugin <id>` command that trusts it. A folder that can't be read or checked shall be listed by its folder name with ✕ and "can't be read or checked", and shall not stop the others. With no plugins it shall say how to add one. With `--json`, it shall give each plugin's id, name, version, status and source. It shall write nothing and need no trust, and it shall exit 0 whenever it lists, empty or not.

## Examples

- Given a plugin Weather 1.2.0 added from a git address at a commit that is trusted,
  when `halonic plugin list` is run,
  then it prints "Weather 1.2.0 github.com/acme/weather@3f2c1ab ✓ on" and exits 0.
- Given a plugin that was added and never trusted,
  when `halonic plugin list` is run,
  then its last column says "! not trusted yet · halonic trust --plugin tides".
- Given no plugins,
  when `halonic plugin list` is run,
  then it prints "No plugins yet. Add one from a folder with halonic plugin add <folder>." and exits 0.
- Given a folder in the plugins folder with no manifest,
  when `halonic plugin list` is run,
  then it is listed by its folder name with "✕ can't be read or checked", and the other plugins are listed too.
