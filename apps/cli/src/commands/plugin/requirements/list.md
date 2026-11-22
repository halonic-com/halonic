# cli.commands.plugin.list

- Status: active
- Since: unreleased
- Source: HAL-1736 (P3, plugin list); cli-output 3.6, approved on HAL-2123; off on this computer from HAL-15080; HAL-15791 (flow check C627 B1: name a plugins folder it can't read)

The `halonic plugin list` command, which is also what `halonic plugin` does on its own, shall list every plugin in the profile's plugins folder, one line per plugin with four columns lined up: the plugin's name, its version, where it was added from and whether it is on, which for a plugin that is on but whose backend doesn't run on this computer is "off on this computer", as `cli.commands.plugin.off-here` says. A git source shall be shown as its address without the scheme and `.git`, then `@` and the first seven characters of the commit; a folder shall be shown as its path, with the home folder written as `~`. A plugin that is trusted shall say "on" with ✓; one never trusted shall say "not trusted yet", and one that changed since it was trusted shall say "changed since you trusted it", each with ! and the `halonic trust --plugin <id>` command that trusts it. A folder that can't be read or checked shall be listed by its folder name with ✕ and "can't be read or checked", and shall not stop the others. With no plugins it shall say how to add one. When the plugins folder itself is there but can't be read, such as for its permissions, it shall list nothing and exit 7 with "✕ Couldn't list the plugins: Halonic can't read the folder <folder>, so it can't tell which plugins are in it." and the fix "Check that the folder belongs to you and that you can read it, then run halonic plugin list again." With `--json`, it shall give each plugin's id, name, version, status and source. It shall write nothing and need no trust, and it shall exit 0 whenever it lists, empty or not.

## Examples

- Given a plugin Weather 1.2.0 added from a git address at a commit that is trusted,
  when `halonic plugin list` is run,
  then it prints "Weather 1.2.0 github.com/acme/weather@3f2c1ab ✓ on" and exits 0.
- Given a plugin that was added and never trusted,
  when `halonic plugin list` is run,
  then its last column says "! not trusted yet · halonic trust --plugin tides".
- Given no plugins,
  when `halonic plugin list` is run,
  then it prints "No plugins yet. Add one with halonic plugin add <folder or git address>." and exits 0.
- Given a folder in the plugins folder with no manifest,
  when `halonic plugin list` is run,
  then it is listed by its folder name with "✕ can't be read or checked", and the other plugins are listed too.
- Given a plugins folder that can't be read, such as after `chmod 000`,
  when `halonic plugin list` is run,
  then it names the folder, says to check that you can read it, and exits 7.
