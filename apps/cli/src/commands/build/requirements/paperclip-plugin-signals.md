# cli.commands.build.paperclip-plugin-signals

- Status: active
- Since: unreleased
- Source: HAL-18365 (plan HAL-17450 rev 5, "Step 2"); `format.workspace-snapshot`, `plugin-build.change-list`

When the workspace has signal files (`library/signals/<id>.signal.yaml`), `halonic build paperclip-plugin` shall put them in the plugin's snapshot, sorted by id, take them as files the build read (so a signal file with changes that aren't committed is refused with exit 5, as a tool file is), and print the signals that changed in the Changes row after the tools and routing, as `signals added <ids>`, `signals removed <ids>` and `signals changed <ids>`. A workspace without signal files shall give a release file without `changes.signals`.

## Examples

- Given a committed workspace with the tool `pr_status` and the signal file `watcher.signal.yaml`,
  when `halonic build paperclip-plugin` runs,
  then the snapshot in the archive holds the signal, the release file's `changes.signals.added` is `watcher`, and the Changes row is "added pr_status · signals added watcher".
- Given that build, and the signal's settings changed and committed,
  when the command runs with `--since` that build's release file,
  then `changes.signals.changed` is `watcher` and the Changes row is "signals changed watcher".
- Given a signal file that isn't committed,
  when the command runs,
  then it fails with "library/signals/watcher.signal.yaml has changes that aren't committed." and exit 5.
