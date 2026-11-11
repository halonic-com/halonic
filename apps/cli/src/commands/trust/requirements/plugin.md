# cli.commands.trust.plugin

- Status: active
- Since: 0.1.0
- Source: HAL-6438, split out of HAL-1736 (P3); cli-output 3.6, approved on HAL-2123; the `--remove` flag and its confirmation from the words check on HAL-1991

The `halonic trust --plugin <id>` command shall show the trust check of the plugin with that id in the profile's plugins folder, the same check as `halonic plugin add`, ask "Trust <name> and turn it on? [y/N]" and, on yes, trust exactly the fingerprint that was shown, say that it is on and exit 0. When the plugin is already trusted as it is now, it shall say it is already on, ask nothing and exit 0. Answering no, or Enter, shall leave it off and exit 3. With no terminal, or `CI` set, and without `--yes --fingerprint`, it shall leave it off, with the check, the reason and the fix on stderr, the bare fingerprint last on stdout, and exit 3. `--yes` shall answer only together with the current `--fingerprint`; `--yes` alone shall be wrong usage (exit 2), and a fingerprint that isn't the current one shall leave it off, ask nothing and exit 3. An id that isn't added shall say there's no plugin with that name, with the nearest id when one is close, and how to see them (exit 4). `--plugin` shall be wrong usage together with `--dir` or `--list`, because a plugin id is never a workspace folder. `--plugin <id> --remove` shall forget the trust in the plugin, so it is off, and keep its settings and secrets.

## Examples

- Given Weather, added but off,
  when `halonic trust --plugin weather` is run in a terminal and the answer is y,
  then the check is shown, Weather is trusted, and it says "✓ Weather is on now." and exits 0.
- Given the same Weather and the answer n,
  when `halonic trust --plugin weather` is run,
  then it says "! Weather is still off. Nothing from it runs until you trust it.", nothing is trusted and it exits 3.
- Given the same Weather and no terminal,
  when `halonic trust --plugin weather` is run,
  then stderr has the check and "! Weather is off, because there's no terminal to ask you to trust it.", the last stdout line is the fingerprint, and it exits 3.
- Given that fingerprint,
  when `halonic trust --plugin weather --yes --fingerprint <fingerprint>` is run,
  then it asks nothing, says "✓ Weather is on now." and exits 0; run again without the flags, it says "✓ Weather is already on. Nothing changed since 11 Nov.".
- Given no plugin with the id wether,
  when `halonic trust --plugin wether` is run,
  then it says `✕ Couldn't trust wether: there's no plugin called "wether". Did you mean weather?` and "See them with halonic plugin list." and exits 4.
- Given Weather, on,
  when `halonic trust --plugin weather --remove` is run,
  then it says "✓ Removed trust for Weather. Nothing from this plugin runs until you trust it.", Weather is off and it exits 0.
