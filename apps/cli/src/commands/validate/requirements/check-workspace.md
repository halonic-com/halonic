# cli.commands.validate.check-workspace

- Status: active
- Since: 0.1.0
- Source: HAL-187 item 5 and HAL-1892; the CLI output design on HAL-1981 (cli-output 3.2, the 20-problem cap and `--all`), approved by the board on HAL-2123; `--dir`, `--all` and `--strict` from HAL-2000; the `--json` fields from the CLI reference on HAL-1986

The `halonic validate` command shall load the workspace in the current folder, or in `--dir <folder>`, and list every problem `loadWorkspace` finds, grouped by file in path order, the errors of a file before its warnings, each in line order, one per line: the line and column, the mark (✕ for an error, ! for a warning), the problem's sentence and its code last. It shall end with one summary line: "✓ Checked N files in <workspace>. No problems." when there are none, a ✓ line with the number of warnings when there are only warnings, and otherwise a ✕ line with the errors, the warnings, the files that have them and the files checked. Without `--all` it shall show at most 20 problems, errors before warnings, and say above the summary how many it left out and the command that shows them all, with the user's `--dir`. It shall exit with 1 when there is an error, or with `--strict` a warning, and with 0 otherwise. A folder without `workspace.yaml` shall stop with the no-workspace error, exit 4. With `--json`, it shall give the files checked, the counts and every problem, never capped. Text from a workspace file shall reach the terminal with its control characters shown as `\u` codes.

## Examples

- Given a workspace with 3 files and no problems in the folder `acme`,
  when `halonic validate` runs in it,
  then it prints "✓ Checked 3 files in acme. No problems." and exits with 0.
- Given a connector that asks approval for a tool it doesn't allow,
  when `halonic validate` runs,
  then it lists the warning under the connector's file, prints "✓ Checked 4 files in acme. 1 warning." and exits with 0; with `--strict` the last line is "✕ 1 warning in 1 file. Checked 4 files." and it exits with 1.
- Given 25 broken agent files,
  when `halonic validate --dir ./acme` runs,
  then it shows 20 problems, then "Showing the first 20 of 25 problems. Run halonic validate --dir ./acme --all to see them all.", and with `--all` all 25.
- Given a folder without `workspace.yaml`,
  when `halonic validate --dir ./downloads` runs,
  then it prints "✕ Couldn't check ./downloads: there's no workspace.yaml here." and "Run it inside a workspace, or create one with halonic init." on stderr and exits with 4.
