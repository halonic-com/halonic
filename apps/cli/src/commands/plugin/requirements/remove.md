# cli.commands.plugin.remove

- Status: active
- Since: 0.1.0
- Source: HAL-1736 and HAL-6653 (P3, plugin remove); cli-output 3.6, approved on HAL-2123

The `halonic plugin remove <id>` command shall remove the plugin whose folder in the profile's plugins folder is named exactly `<id>`, with its trust, settings and secrets, through `PluginService.remove`. It shall ask first, "Remove Weather? Its settings and the API key you entered are removed from this computer. [y/N]", or "Its settings are removed from this computer." for a plugin with no secrets, and on yes print "✓ Removed Weather 1.2.0 and its trust." and exit 0. With `--yes` it shall ask nothing. On No, or Enter, it shall remove nothing, print "Not removed. Weather is still added." and exit 1. With no terminal, or `CI` set, and no `--yes`, it shall remove nothing and exit 2 with "✕ Removing Weather deletes its settings and secrets, and there's no terminal to ask you." and "To remove it anyway, pass --yes.". A plugin that can't be read or checked shall be removed the same way, named by its folder's name. A link in the plugins folder shall be removed itself, never what it points to. With no plugin of exactly that id, it shall exit 4 with "✕ There's no plugin called "wether".", naming a near id when there is one, and "See them with halonic plugin list.".

## Examples

- Given a trusted plugin Weather 1.2.0 with a secret,
  when `halonic plugin remove weather` is run and the user answers y,
  then it prints "✓ Removed Weather 1.2.0 and its trust.", the plugin's folder is gone and adding it again asks for trust again.
- Given a trusted plugin Weather and no terminal,
  when `halonic plugin remove weather` is run without `--yes`,
  then it removes nothing and exits 2.
- Given a link `weather` in the plugins folder to a folder outside it,
  when `halonic plugin remove weather --yes` is run,
  then the link is gone and the folder it pointed to and its files are unchanged.
- Given a plugin `weather`,
  when `halonic plugin remove wether` is run,
  then it prints "✕ There's no plugin called "wether". Did you mean weather?" and exits 4.
