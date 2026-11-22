# cli.commands.plugin.add-update

- Status: active
- Since: unreleased
- Source: HAL-14325 (Nina's C340, C45, on HAL-14271); `app.plugin-add`'s replace

The `halonic plugin add <folder or git address> --update` command shall add the plugin as `halonic plugin add` does when no plugin with its id is added. When a plugin with exactly its id is added, it shall put the new copy in place of that one through `PluginService.add` with `replace`, keeping the plugin's settings, its stored secrets and their names, and record the new source and the day in its install record. When the new copy's files differ from the ones trusted, the fingerprint changes, so it shall show the trust check and ask as `halonic plugin add` does, with "✓ Updated <name> <version>. It's on." on yes, "! <name> is updated but off. Nothing from it runs until you trust it: halonic trust --plugin <id>" on No or Enter (exit 3), and "<name> is updated but off, because there's no terminal to ask you to trust it." as line 1 without a terminal (exit 3); `--yes --fingerprint` shall answer as there. When the new copy's files are the ones trusted, it shall ask nothing, say "✓ Updated <name> <version>. Its files are the ones you trusted, so it's still on." and exit 0. For a plugin whose backend doesn't run on this computer, the line once it is trusted shall be "! Updated <name> <version>. It's trusted, but off on this computer until you allow plugins and integrations to run without the sandbox.". With `--json` it shall add `"updated": true` when it replaced a plugin. When even a replace can't place the copy, such as for a plugin folder that is a link, it shall be refused as already added with the fix "To add this copy, remove it first: halonic plugin remove <id>" and exit 5. A copy that can't be read or checked shall be refused before anything is replaced, as `halonic plugin add` refuses it.

## Examples

- Given Weather 1.2.0 added from `./weather`, trusted, with a setting saved,
  when a file in `./weather` is changed and `halonic plugin add ./weather --update` is run in a terminal and the answer is y,
  then the check is shown, it says "Updated Weather 1.2.0. It's on.", the setting is still saved, and it exits 0.
- Given the same plugin and the answer n,
  when `halonic plugin add ./weather --update` is run,
  then the new copy is in place and not trusted, and it says "Weather is updated but off. Nothing from it runs until you trust it: halonic trust --plugin weather" and exits 3.
- Given Weather added and trusted and `./weather` unchanged,
  when `halonic plugin add ./weather --update` is run,
  then it asks nothing, says "Updated Weather 1.2.0. Its files are the ones you trusted, so it's still on." and exits 0.
- Given no plugin weather added,
  when `halonic plugin add ./weather --update` is run and the answer is y,
  then it says "Added Weather 1.2.0. It's on." as without `--update`.
- Given Weather added and a copy of `./weather` whose plugin.yaml has `version: 1.0`,
  when `halonic plugin add ./weather --update` is run,
  then it is refused with the manifest problem, the added copy stays as it was, and it exits 2.
