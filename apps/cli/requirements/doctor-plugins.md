# cli.doctor-plugins

- Status: active
- Since: unreleased
- Source: HAL-14296, from Nina's C340 check on HAL-14271 (rows 20–23, code row C40); the plugin states of `halonic tools review` (`cli.commands.tools.plugin-connector`), decided by the team (Liam); the plugin records, from Iris's flow check C646 (HAL-15893, HAL-15916), decided by the team under HAL-2282; the `--dir` wording, from Nina's C729 check (HAL-16621), decided by the team

The `halonic doctor` command shall check each plugin that a connector an agent of the workspace can use names against the plugins added on this computer, as `halonic tools review` does, and show a Plugins line, after Secrets and before Sandbox, when one isn't added, is off or can't be read. A plugin that isn't added shall be marked with ✕, with the connector that names it, and `doctor` shall exit with 1; one that is off or can't be read shall be marked with !, and `doctor` shall still exit with 0. It shall read the profile's plugins only when such a connector uses one. In any folder it checks, with or without a workspace, it shall also read the profile's plugin records, and when a record file or their folder can't be opened by the person, or a record file is damaged, the Plugins line shall name it first, marked with !, with the reason and fix of `cli.plugin-record-unreadable` in the doctor's words, and `doctor` shall still exit with 0; the plugins the workspace's connectors use shall then not be listed again as plugins that can't be read. With `--json`, the check shall be `plugins` with its `problems`, `records-unreadable` or `records-damaged` for the plugin records. A `--dir` that names a folder without a workspace still stops with exit 4 before any line, as `cli.commands.doctor.check-this-computer` says, so outside a workspace the plugin records are read by `halonic doctor` without `--dir`.

## Examples

- Given the agent Helper uses the connector `orders`, which names the plugin `acme-order`, and only `acme-orders` is added,
  when `halonic doctor` runs,
  then it prints "✕ Plugins     orders uses the plugin acme-order, which isn't added, so orders has no tools yet." with "Did you mean acme-orders?" and a fix under it, and exits with 1.
- Given `acme-orders` added and changed since it was trusted,
  then it prints "! Plugins     acme-orders is off: changed since you trusted it · halonic trust --plugin acme-orders", and exits with 0.
- Given no agent uses a plugin's connector,
  then there is no Plugins line, and the plugins aren't read.
- Given a folder without a workspace, and a line "not a record" added to the record file that keeps where each plugin was added from,
  when `halonic doctor` runs,
  then it prints "! Plugins     The plugin record file <file> is damaged at line 2: it is not JSON." with "Fix: delete line 2 from it, or delete the file, then run halonic doctor again. Deleting the file forgets where each plugin was added from; the plugins stay." under it, and exits with 0.
