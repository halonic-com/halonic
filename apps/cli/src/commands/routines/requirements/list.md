# cli.commands.routines.list

- Status: active
- Since: 0.1.0
- Source: HAL-4844, HAL-4888, HAL-187 item 7; the `--json` shape of HAL-2000 (cli-output 1.8). cli-output has no section for `routines`; the words are team wording built on the `halonic runs` list (cli-output 3.4), as HAL-2282 allows

The `halonic routines` command shall list every routine of the workspace, in the order of the files' paths, one line per routine with four columns lined up: the routine's name, its trigger in the words of `describeTrigger`, its next run and its last run, dimmed. The next run shall be written as the `runs` list writes a waiting run's time ("Next 16 Nov 09:00"), or say "Off" for a routine that is off and "No set time" for one no clock starts. The last run shall give the start of the newest real run the routine started and the `runs` list's status for it, or say "Never ran". When the routines come from more than one hub, the name shall be followed by the routine's hub id, dimmed, so two routines of the same name can be told apart, and a routine at the workspace's root shall show no hub; with one hub, the name shall stand alone. A workspace without routines shall say so and how to add one. With `--json`, it shall give each routine's key, hub, id, name, whether it is on, its trigger in words, its next run as ISO time and its last run's id, status and start. It shall start nothing, write nothing and need no trust, and it shall exit 0 whenever it lists, empty or not.

## Examples

- Given the Acme example on Tuesday 10 Nov 2026,
  when `halonic routines` is run,
  then it prints "Weekly report Mondays at 09:00 Next 16 Nov 09:00 Never ran" and exits 0.
- Given a Weekly report routine in the reports hub and another in the support hub,
  when `halonic routines` is run,
  then the rows begin "Weekly report reports" and "Weekly report support".
- Given a routine that is off,
  when `halonic routines` is run,
  then its Next column says "Off".
- Given a routine whose trigger is `manual: true`,
  when `halonic routines` is run,
  then its Next column says "No set time".
- Given a routine that started a run at 10:40 which now waits for the user,
  when `halonic routines` is run,
  then its Last column says "Last 10:40 · ! Needs you".
- Given a workspace without routines,
  when `halonic routines` is run,
  then it prints "No routines in Acme yet. Add one as workflows/routines/<id>.routine.yaml in a hub." and exits 0.
- Given a folder without a workspace,
  when `halonic routines` is run,
  then it stops with "✕ Couldn't list the routines in downloads: there's no workspace.yaml here.", exit 4.
