# cli.commands.init.create-workspace

- Status: active
- Since: 0.1.0
- Source: HAL-187 item 5 and HAL-1892; the CLI output design on HAL-1981 (cli-output 1.6 and 3.1, with the `Next:` block, B3), approved by the board on HAL-2123; the `--json` fields from the CLI reference on HAL-1986; `initWorkspace` from `core/workspace` (`core.workspace.init`)

The `halonic init [folder]` command shall lay out a new, empty workspace with `initWorkspace` in the folder it is given, created when missing, or in the current folder without one, named after the folder. It shall print one ✓ line with the workspace and the folder, then the `Next:` block: `cd` into the folder when it isn't the current one, `halonic validate` with its why-words in the column of cli-output 3.1, and the line that names Studio as a choice. When the folder has files in it, it shall write nothing and stop with "the folder isn't empty." and its fix, exit 5. When the disk is full, the folder can't be written or another app holds a file, it shall stop with that reason, by the error's kind. More than one folder is a usage error, exit 2. With `--json`, it shall give the workspace's name and folder, `example: null`, the files it wrote and the counts.

## Examples

- Given an empty folder,
  when `halonic init acme` runs in it,
  then `acme/workspace.yaml` holds the id and name `acme`, and it prints "✓ Created the workspace acme in ./acme.", an empty line, "Next:", then, indented, `cd acme`, `halonic validate` with "check the files as you edit them", and "Add your first agent: https://docs.halonic.dev/examples/agent-with-a-tool", and exits with 0.
- Given the empty folder `acme` as the current folder,
  when `halonic init` runs,
  then it prints "✓ Created the workspace acme in this folder." and no `cd` line.
- Given a folder `acme` with a `notes.txt` in it,
  when `halonic init acme` runs,
  then it prints "✕ Couldn't create the workspace in ./acme: the folder isn't empty." and "Pick a new folder name, or run it in an empty folder.", writes nothing and exits with 5.
- Given the current folder with a `notes.txt` in it,
  when `halonic init` runs,
  then it prints "✕ Couldn't create the workspace in this folder: the folder isn't empty.", writes nothing and exits with 5.
- Given `halonic init acme demo`,
  when it runs,
  then it prints "✕ halonic init takes one folder name, and you gave two: acme, demo." and the usage line, and exits with 2.
