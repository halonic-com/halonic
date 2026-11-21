# cli.commands.plugin.programs-run

- Status: active
- Since: unreleased
- Source: HAL-12343 (PR 5, from Nina's C54 docs check on HAL-12637 P17); words from Studio's trust check, design section 5 and microcopy 24 T8; the "can't start" words are R11's from microcopy 24.1 (HAL-3384, C506 C1 on HAL-14929)

The `halonic plugin add` and `halonic trust --plugin <id>` trust checks shall show, under each program in the Programs section, "Runs: " and where it runs, in the words Studio's trust check shows for the same state (`pluginTrustRunsText`): "In the agent sandbox, in its own empty folder" when the sandbox works on this computer, and "Doesn't start on this computer: the sandbox can't start here" when it doesn't. The `halonic plugin list` command shall show, on the line under each plugin that has programs and can be read, "Programs: " and the same words, with ! when its programs don't run here. With `--json`, each plugin shall give `programsRun`: the state (`ready`, `needs-desktop-app` or `sandbox-unavailable`), or `null` when it has no programs. The state shall be the one `PluginLocalTools.state()` gives for the sandbox a run starts programs in, and the sandbox shall be asked only when a plugin shown has programs.

## Examples

- Given a plugin with one program, on a computer where the sandbox can't start,
  when `halonic plugin add` shows its trust check,
  then the line under the program says "Runs: Doesn't start on this computer: the sandbox can't start here".
- Given a trusted plugin with one program, on a computer where the sandbox can't start,
  when `halonic plugin list` is run,
  then its row says "✓ on" and the line under it says "! Programs: Doesn't start on this computer: the sandbox can't start here".
- Given only plugins without programs,
  when `halonic plugin list` is run,
  then no line is added under any row, and the sandbox isn't asked.
