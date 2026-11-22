# cli.commands.trust.plugin

- Status: active
- Since: unreleased
- Source: HAL-6438, split out of HAL-1736 (P3); cli-output 3.6, approved on HAL-2123; the `--remove` flag and its confirmation from the words check on HAL-1991; the refusal of a broken plugin from HAL-13799 and HAL-14609; off on this computer from HAL-15080; the sign-out lines from HAL-15083; "no trust to remove" from HAL-15398

The `halonic trust --plugin <id>` command shall show the trust check of the plugin with that id in the profile's plugins folder, the same check as `halonic plugin add`, with the full fingerprint under it in a terminal, ask "Trust <name> and turn it on? [y/N]" and, on yes, trust exactly the fingerprint that was shown, say that it is on and exit 0. When the plugin is already trusted as it is now, it shall say it is already on, ask nothing and exit 0. For a plugin whose backend doesn't run on this computer, both shall say instead that it is trusted but off here, as `cli.commands.plugin.off-here` says. Answering no, or Enter, shall leave it off and exit 3. With no terminal, or `CI` set, and without `--yes --fingerprint`, it shall leave it off, with the check, the reason and the fix on stderr, the bare fingerprint last on stdout, and exit 3. `--yes` shall answer only together with the current `--fingerprint`; `--yes` alone shall be wrong usage (exit 2), and a fingerprint that isn't the current one shall change nothing, ask nothing and exit 3, also when the plugin is already on. When the files change between the check and the answer, the refusal shall give the fingerprint they have now as its last stdout line. An id that isn't added shall say there's no plugin with that name, with the nearest id when one is close, and how to see them (exit 4). A plugin that can't be read or checked shall be refused and stay off: it shall say its first problem, after the path of the field it is about when it is about one, with control characters and text-direction marks taken out, and the fix "Remove it with halonic plugin remove <id>, then add a version that works." (exit 2). `--plugin` shall be wrong usage together with `--dir` or `--list`, because a plugin id is never a workspace folder. `--plugin <id> --remove` shall sign out the plugin's sign-ins and forget the trust in the plugin, so it is off, and keep its settings and secrets (`app.plugin-sign-out`). When it signed out a sign-in, a line "✓ Signed you out of <sign-ins>." shall follow the confirmation, and when the provider didn't confirm one, or there was no address to revoke it at, a line marked with ! shall say Studio's words after **Sign out**: "You're signed out here. <name> didn't confirm, so the token may still work there until it expires." For a plugin that wasn't trusted, because it was never turned on or its trust was already removed, it shall say "✓ Weather isn't trusted on this computer, so there was no trust to remove." in place of the confirmation, with the sign-out lines after it when it still signed out a sign-in, and exit 0. `halonic trust --remove` in the plugin's folder shall say the same lines, also once the plugin's trust is gone. With `--json` it shall give the `status` `removed`, or `not-trusted` when there was no trust, the sign-ins it signed out as `signedOut` and those not confirmed as `signOutNotConfirmed`. It asks nothing, so, like workspace `trust --remove`, it shall ignore `--yes` and `--fingerprint`.

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
- Given Weather, whose plugin.yaml has a text-direction mark (U+202E) in the second choice of its units setting,
  when `halonic trust --plugin weather` is run,
  then it says "✕ Couldn't trust weather: ui.settings.units.choices[1]: don't use control characters or text-direction marks" and "Remove it with halonic plugin remove weather, then add a version that works.", without the mark, Weather stays off and it exits 2.
- Given Weather, on,
  when `halonic trust --plugin weather --remove` is run,
  then it says "✓ Removed trust for Weather. Nothing from this plugin runs until you trust it.", Weather is off and it exits 0.
- Given Weather, off,
  when `halonic trust --plugin weather --remove` is run,
  then it says "✓ Weather isn't trusted on this computer, so there was no trust to remove." and exits 0.
- Given Weather, on and signed in with `weather-account`, whose provider doesn't answer the revoke,
  when `halonic trust --plugin weather --remove` is run,
  then under the confirmation it says "✓ Signed you out of weather-account." and "! You're signed out here. Weather didn't confirm, so the token may still work there until it expires.", the grant is gone and it exits 0.
- Given Weather, on,
  when `halonic trust --plugin weather --yes --fingerprint <a fingerprint that isn't its current one>` is run,
  then it says "✕ That fingerprint doesn't match Weather as it is now.", Weather stays on and it exits 3.
