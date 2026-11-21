# cli.commands.plugin.off-here

- Status: active
- Since: unreleased
- Source: HAL-15080, from check C540 #2 on HAL-15074; R13's words from microcopy 24.1 (HAL-751, approved on HAL-1949), as Studio's plugin page says them (`plugins.plugin-page-needs-yes`); the reason and fix from `app.runner-unfenced-words`; the command holds no yes (`cli.no-unfenced-run-yes`)

Where a plugin's backend wouldn't run in the sandbox on this computer, as its start's gate decides from the platform and the sandbox check (`runnerFence`), the `halonic` command shall say a trusted plugin with a backend is off here, because it never runs plugin code without the sandbox. `halonic trust --plugin <id>` shall say "! *Name* is trusted, but off on this computer until you allow plugins and integrations to run without the sandbox." in place of "✓ *Name* is on now.", and "! *Name* is already trusted, but off on this computer until you allow plugins and integrations to run without the sandbox." in place of "is already on"; `halonic plugin add` shall say "! Added *Name* *version*. It's trusted, but off on this computer until you allow plugins and integrations to run without the sandbox." in place of "✓ Added *Name* *version*. It's on.". Each shall be followed by two indented lines: the reason and its fix in `runnerUnfencedWords`' words for plugin code, then "Allow it in the Halonic desktop app. The halonic command runs plugin code only in the sandbox." Trust is still saved, and each still exits 0. `halonic plugin list` shall show such a plugin that is on as "! off on this computer", with the same two lines under it. With `--json`, each shall give `offOnThisComputer`: the reason code, or for `plugin list` `null` when the plugin isn't off here, while `status` keeps its value. The sandbox shall be asked only when a plugin shown has a backend; in the sandbox, and for a plugin without a backend, the command shall say what it said before.

## Examples

- Given Weather, with a backend, added but off, on a computer where Halonic runs inside a container,
  when `halonic trust --plugin weather --yes --fingerprint <fingerprint>` is run,
  then Weather is trusted, it says "! Weather is trusted, but off on this computer until you allow plugins and integrations to run without the sandbox.", then "  Halonic is running inside a container, and the sandbox can't start there. Run Halonic on the computer itself, not in a container." and "  Allow it in the Halonic desktop app. The halonic command runs plugin code only in the sandbox.", and exits 0.
- Given the same, trusted,
  when `halonic plugin list` is run,
  then Weather's line ends with "! off on this computer" and the same two lines follow it.
- Given Lister, with only a program, on the same computer,
  when it's added with `--yes --fingerprint <fingerprint>`,
  then it says "✓ Added Lister 1.0.0. It's on." and the sandbox isn't asked about plugin code.
