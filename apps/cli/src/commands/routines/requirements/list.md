# cli.commands.routines.list

- Status: active
- Since: 0.1.0
- Source: HAL-4844, HAL-4888, HAL-12323, HAL-187 item 7; the `--json` shape of HAL-2000 (cli-output 1.8); a routine file that doesn't load, HAL-12607; routines that won't start and the Next column's time zone, HAL-14299 (C340 C33, team wording built on C336/C337); "Can't start" as the Studio says it, `routines list` and no next run in `--json` for a routine that can't start, HAL-15082 (C540 #4); the webhook routines `halonic serve` says won't start, HAL-15397 (C570 #3); the line for saved changes that aren't live yet, and the Studio in the last line, HAL-15204 (C548 3), built on the Studio's "Changes not live yet" and `run`'s line about uncommitted changes; which version the columns show for that routine, HAL-15513 (C585 G1). cli-output has no section for `routines`; the words are team wording built on the `halonic runs` list (cli-output 3.4), as HAL-2282 allows

The `halonic routines` command, and `halonic routines list` the same way, shall list every routine of the workspace, in the order of the files' paths, one line per routine with four columns lined up: the routine's name, its trigger in the words of `describeTrigger`, its next run and its last run, dimmed. A routine file that doesn't load shall be listed too, as the routine list gives it: its routine id, its first error and line. The next run shall be written as the `runs` list writes a waiting run's time ("Next 16 Nov 09:00"), or say "✕ Can't start", the Studio's word, for a routine whose file has errors, "Off" for a routine that is off and "No set time" for one no clock starts. A schedule that names a time zone other than this computer's shall have its next run written in that zone, followed by the zone, dimmed: "Next 13 Nov 16:00 (Europe/Amsterdam)". The last run shall give the start of the newest real run the routine started and the `runs` list's status for it, or say "Never ran". When the routines come from more than one hub, the name shall be followed by a · and the routine's hub id, dimmed, so two routines of the same name can be told apart, and a routine at the workspace's root shall show no hub; with one hub, the name shall stand alone. When routines have errors, a first line shall count them and name the command that shows them: "! 1 routine can't start · halonic validate", with the user's own `--dir`. When webhook routines without errors won't start, a line after it shall count them and name the command that says why under each one's address: "! 1 routine can't start on a web request · halonic serve", with the user's own `--dir`. When a routine's saved file differs from the live version's, as core's `liveState` finds it, a line under the list shall say so, since `halonic routines watch` and the Studio start it as last committed: "! Weekly report has changes that aren't live yet. It runs as last committed until you commit them."; a workspace without history, a routine no version has yet, or a routine only turned on or off shall get no such line. For such a routine, the trigger and Next columns and `--json`'s `nextRun` and `timeZone` shall show the live version, the one that starts it, while its name and whether it is on come from the saved file, as `cli.commands.routines.list-live-version` says; every other routine is listed from its saved file. When git can't start in a workspace with history, it shall still list the routines and exit as it would, with a line saying it couldn't check what's live, in the words `halonic run` gives for git, and that refusal's fix, dimmed. When it lists routines, it shall end with one dim line saying a routine starts on time only while `halonic routines watch` is running or the Studio is open. A workspace without routines shall say so and how to add one. With `--json`, it shall give each routine's key, hub, id, name, whether it is on, its trigger in words, its next run as ISO time (`null` when it is off, no clock starts it, or it can't start), its schedule's time zone, how many errors its file has, and its last run's id, status and start. It shall start nothing, write nothing and need no trust. It shall exit 1 when a routine's file has errors or a webhook routine won't start, since that routine can't start, and 0 otherwise, empty or not.

## Examples

- Given the Acme example on Tuesday 10 Nov 2026,
  when `halonic routines` is run,
  then it prints "Weekly report Mondays at 09:00 Next 16 Nov 09:00 Never ran" and exits 0.
- Given a Weekly report routine in the reports hub and another in the support hub,
  when `halonic routines` is run,
  then the rows begin "Weekly report · reports" and "Weekly report · support".
- Given a routine that is off,
  when `halonic routines` is run,
  then its Next column says "Off".
- Given a routine whose trigger is `manual: true`,
  when `halonic routines` is run,
  then its Next column says "No set time".
- Given a routine that started a run at 10:40 which now waits for the user,
  when `halonic routines` is run,
  then its Last column says "Last 10:40 · ! Needs you".
- Given a support routine file `broken.routine.yaml` whose trigger is `every: 0m`,
  when `halonic routines` is run,
  then it prints "! 1 routine can't start · halonic validate", then "broken   Invalid file, line 3: use a number and a unit, e.g. "15m", "1h", "1d" (runs are placed from midnight UTC)   ✕ Can't start   Never ran", and exits 1.
- Given a support routine Friday digest that runs the workflow `weekly-digest`, which the hub doesn't have,
  when `halonic routines --dir .` is run,
  then it prints "! 1 routine can't start · halonic validate --dir .", its Next column says "✕ Can't start", and it exits 1.
- Given a support routine New mail on a signed web request whose secret mail-hook isn't set, and a routine Agent on request on a signed web request that starts the agent `writer`,
  when `halonic routines --dir .` is run,
  then it prints "! 2 routines can't start on a web request · halonic serve --dir .", both Next columns say "✕ Can't start", and it exits 1.
- Given that Friday digest routine,
  when `halonic routines --json` is run,
  then its `nextRun` is `null`.
- Given the Acme example,
  when `halonic routines list` is run,
  then it prints the same list as `halonic routines`.
- Given a routine with the schedule `0 16 * * 5` and `timezone: Europe/Amsterdam`, on a computer in UTC on Tuesday 10 Nov 2026,
  when `halonic routines` is run,
  then its Next column says "Next 13 Nov 16:00 (Europe/Amsterdam)".
- Given a Morning check routine committed on a daily schedule at 08:00 and saved since at 07:00,
  when `halonic routines` is run,
  then the line "! Morning check has changes that aren't live yet. It runs as last committed until you commit them." follows the list, and it exits 0.
- Given that routine only turned off since it was committed,
  when `halonic routines` is run,
  then no such line shows.
- Given a workspace with history where git can't start,
  when `halonic routines` is run,
  then it lists the routines, says "! Couldn't check what's live: git can't start on this computer, so the live version can't be read. So the list doesn't say which changes aren't live yet.", then "Install git and make sure it's on your PATH, then try again.", and exits 0.
- Given a workspace without routines,
  when `halonic routines` is run,
  then it prints "No routines in Acme yet. Add one as workflows/routines/<id>.routine.yaml in a hub." and exits 0.
- Given a folder without a workspace,
  when `halonic routines` is run,
  then it stops with "✕ Couldn't list the routines in downloads: there's no workspace.yaml here.", exit 4.
