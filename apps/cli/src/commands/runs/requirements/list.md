# cli.commands.runs.list

- Status: active
- Since: 0.1.0
- Source: HAL-2742; C174 on HAL-2000 and HAL-1984; the CLI output design on HAL-1981 (cli-output section 3.4, "the list", revisions 27 to 38), approved by the board on HAL-2123

The `halonic runs` command shall list the workspace's real runs, never its test runs, newest start first, at most `--limit` of them (20 by default), one line per run with five columns lined up: the status, the short id, the workflow's title, the What sentence and the When column, dimmed. When `--limit` leaves runs out, it shall end with the line that says how many and how to see them all. An empty list shall say why: no runs yet, only test runs, or filters that match nothing, with the way to see every run. `--status`, `--workflow` (an id, or `hub/id`) and `--limit` shall narrow the list, and a wrong value shall stop with the error and fix of cli-output 3.4. With `--json`, it shall give the listed runs and how many match in all. Every suggested command shall keep the user's `--dir`. It shall exit 0 whenever it lists, empty or not.

## Examples

- Given Acme with a running, a waiting and a completed run of Support reply,
  when `halonic runs` is run,
  then it prints three lined-up rows, newest first, such as "✓ Done a1b2c3 Support reply Sent nothing 10:31 · took 18 s".
- Given 3 runs,
  when `halonic runs --limit 1` is run,
  then it prints one row and "Showing the newest of 3 runs. See them all with halonic runs --limit 3.".
- Given no runs,
  when `halonic runs --dir ./acme` is run,
  then it prints "No runs in Acme yet. Start one with halonic run --dir ./acme <workflow>." and exits 0.
- Given a completed run and no failed run,
  when `halonic runs --status failed` is run,
  then it prints "No failed runs in Acme." and " See every run with halonic runs.", and exits 0.
- Given `--status done`,
  when `halonic runs` is run,
  then it stops with "✕ --status takes running, waiting, completed or failed, and you gave "done"." and "Did you mean completed?", exit 2.
- Given `--workflow suport-reply` and no run of that workflow,
  when `halonic runs` is run,
  then it stops with "✕ There's no workflow called "suport-reply" in Acme." and "Did you mean support-reply?", exit 4.
- Given the workflow `reply` in the hubs `sales` and `support`,
  when `halonic runs --workflow reply` is run,
  then it stops with "✕ There's a workflow called "reply" in two hubs." and "Name the hub: sales/reply or support/reply.", exit 2.
- Given a folder without a workspace,
  when `halonic runs --dir ./downloads` is run,
  then it stops with "✕ Couldn't list the runs in downloads: there's no workspace.yaml here.", exit 4.
