# cli.commands.extract.extract-hub

- Status: active
- Since: 0.1.0
- Source: HAL-4845 (HAL-187 item 8): the old `studio extract <dir> <hub> <out>` at `784f78d`, in the HAL-2000 command style and the `init` output of cli-output 3.1; `extractHub` from `core/workspace` (`workspace.extract`); the thin-command rule (HAL-1661)

The `halonic extract <hub> <new-folder>` command shall move the hub, with the shared items it uses, into a new workspace in the folder it is given, with `extractHub`, reading the workspace in `--dir` or else the current folder and leaving it unchanged. It shall print the ✓ line naming the hub, the new folder and the unchanged workspace, a dimmed line with the counts of hub, shared and workspace files, a dimmed line with the shared items when there are any, then the `Next:` block: `cd` into the folder, `halonic validate` and `halonic trust` with their why-words, and the line that says to remove the hub from the old workspace once the new one runs. With `--dry-run`, it shall write nothing and list the files it would write, grouped under the hub, the shared items and the workspace files. With `--json`, it shall give the hub, its name, the folder, `dryRun`, every file with its part and the shared items taken. When the hub isn't one of the workspace's, it shall write nothing and say so on a line of its own with "Did you mean" when one is close and the hubs there are, or that the workspace has no hub, exit 4. When the workspace has errors, or the folder has files in it, it shall write nothing and say why, exit 5. A missing hub or folder, or a folder inside the workspace, is a usage error, exit 2.

## Examples

- Given a workspace `home` with hubs `family` and `investing`, where `family`'s agent uses the shared skill `tone`,
  when `halonic extract family family --dir home` runs,
  then it prints "✓ Extracted the hub Family affairs to ./family. The workspace home is unchanged.", " 2 hub files · 1 shared file · 4 workspace files", " Shared items: skills: tone", an empty line, "Next:", then, indented, `cd family`, `halonic validate` with "check the new workspace", `halonic trust` with "trust it on this computer before a run", and "Once it runs, remove hubs/family from home.", and exits with 0; `family` loads with no errors and one hub, and keeps `privacy.localOnly: true`.
- Given the same workspace,
  when `halonic extract family family --dir home --dry-run` runs,
  then it prints "Would extract the hub Family affairs to ./family. Nothing was written.", the files under "From the hub:", "Shared items:" and "Workspace files:", and `family` doesn't exist afterwards.
- Given `halonic extract famly family --dir home`,
  when it runs,
  then it prints "✕ There's no hub called "famly" in home. Did you mean family?" and " Hubs: family, investing", and exits with 4.
- Given a workspace `home` whose agent names a skill that doesn't exist,
  when `halonic extract family family --dir home` runs,
  then it prints "✕ Couldn't extract the hub family to ./family: the workspace has 1 error, which the copy would keep." and " Run halonic validate --dir ./home to see what to fix, then extract again.", writes nothing and exits with 5.
- Given a `family` folder with a `notes.txt` in it,
  when `halonic extract family family --dir home` runs,
  then it prints "✕ Couldn't extract the hub family to ./family: the folder isn't empty.", writes nothing and exits with 5.
