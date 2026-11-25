# cli.commands.routines.list

- Status: active
- Since: 0.1.0
- Source: HAL-4844, HAL-4888, HAL-12323, HAL-187 item 7; the `--json` shape of HAL-2000 (cli-output 1.8); a routine file that doesn't load, HAL-12607; routines that won't start and the Next column's time zone, HAL-14299 (C340 C33, team wording built on C336/C337); "Can't start" as the Studio says it, `routines list` and no next run in `--json` for a routine that can't start, HAL-15082 (C540 #4); the webhook routines `halonic serve` says won't start, HAL-15397 (C570 #3); the line for saved changes that aren't live yet, and the Studio in the last line, HAL-15204 (C548 3), built on the Studio's "Changes not live yet" and `run`'s line about uncommitted changes; their wording, and "Halonic Studio" as the allow-address error names it, HAL-15504 (C588 rows 22 to 24); "Paused until trusted" in a workspace that isn't trusted here, as the Studio's chip says, HAL-15525 (C587 #3), and the file trust refuses instead of `halonic trust`, and that line only when a row says "Paused until trusted", HAL-15504 (Liam's review of #4741); which version the columns show for that routine, HAL-15513 (C585 G1); a routine never live and saved changes with errors, HAL-15664 (C610 #1–2); "Can't start" and its line for a routine that starts an agent, HAL-15607 (C600 #2), in the words of the Studio's Starts card and `serve`'s webhook line; every "Can't start" row counted above the list and given its reason under it, file errors first, HAL-16096 (C672 #1); `halonic trust` after the fix for a file trust refuses, HAL-16137 (C676 row 38). cli-output has no section for `routines`; the words are team wording built on the `halonic runs` list (cli-output 3.4), as HAL-2282 allows; `halonic serve` named in the last line, HAL-18602 (team wording, HAL-2282)

The `halonic routines` command, and `halonic routines list` the same way, shall list every routine of the workspace, in the order of the files' paths, one line per routine with four columns lined up: the routine's name, its trigger in the words of `describeTrigger`, its next run and its last run, dimmed. A routine file that doesn't load shall be listed too, as the routine list gives it: its routine id, its first error and line. The next run shall be written as the `runs` list writes a waiting run's time ("Next 16 Nov 09:00"), or say "✕ Can't start", the Studio's word, for a routine whose file has errors, that starts an agent on its own, which Halonic can't run yet, or a webhook routine that is on and that `halonic serve` says can't start, by serve's own check (its secret isn't set or its name belongs to Halonic or a plugin, a trigger value a web request has no value for, or it starts an agent), "Off" for a routine that is off, "Not live yet" for one that is on but was never live in a workspace with history, "! Paused until trusted", the Studio's chip, for any other that is on in a workspace that isn't trusted on this computer, by the rule `halonic routines watch` refuses by, and "No set time" for one no clock starts. A schedule that names a time zone other than this computer's shall have its next run written in that zone, followed by the zone, dimmed: "Next 13 Nov 16:00 (Europe/Amsterdam)". The last run shall give the start of the newest real run the routine started and the `runs` list's status for it, or say "Never ran". When the routines come from more than one hub, the name shall be followed by a · and the routine's hub id, dimmed, so two routines of the same name can be told apart, and a routine at the workspace's root shall show no hub; with one hub, the name shall stand alone. When routines can't start because their files have errors or they start an agent on its own, a first line shall count every such row and say that the reasons follow: "! 3 routines can't start. The lines under the list say why." (or "! 1 routine can't start. The line under the list says why."). Under the list, in the list's order, each such routine shall get one line with its reason, its file's errors first, since a routine whose agent or workflow isn't there is fixed there: "! Friday digest can't start until its file is fixed · halonic validate", with the user's own `--dir`, as `halonic routines watch` says it, so the command named lists that routine's errors; or, for a routine without errors that starts an agent on its own, why it can't start and what to do: "! Daily digest can't start: Halonic can't run an agent on its own yet, only as a step in a workflow. Make a workflow with the agent as a step, then have the routine start that workflow."; that one doesn't change the exit code, since its file has no error. When webhook routines without errors that don't start an agent can't start, a line after it shall count them and name the command that says why under each one's address: "! 1 routine can't start on a web request · halonic serve", with the user's own `--dir`. When a routine's Next column says "Paused until trusted", a line before the list shall say so and name the command that trusts it: "! Acme isn't trusted on this computer yet, so its routines don't start · halonic trust", or "! Acme changed since you trusted it, so its routines don't start · halonic trust" when it changed since, with the user's own `--dir`; a trust record that can't be read counts as not trusted. When a file names something trust can't cover, such as a URL with user info, `halonic trust` would refuse too, so the line shall first give each file and why, in `halonic trust`'s words, never the address, then the fix, ending with the command that trusts the workspace once the file is fixed, with the user's own `--dir`, since fixing the file doesn't trust it: "! Acme's routines don't start: library/connectors/web.connector.yaml can't be trusted, because the address has a user name or password in it. Fix the address in that file, then trust the workspace with halonic trust." When a routine's saved file differs from the live version's, as core's `liveState` finds it, a line under the list shall say so, since `halonic routines watch` and the Studio start it as last committed: "! Weekly report has changes that aren't live yet. It runs as last committed until you commit them or make them live in Halonic Studio."; a workspace without history, a routine no version has yet, or a routine only turned on or off shall get no such line, and the line for saved changes with errors and for a routine no version has yet is in `cli.commands.routines.list-live-version`. For such a routine, the trigger and Next columns and `--json`'s `nextRun` and `timeZone` shall show the live version, the one that starts it, while its name and whether it is on come from the saved file, as `cli.commands.routines.list-live-version` says; every other routine is listed from its saved file. When git can't start in a workspace with history, it shall still list the routines and exit as it would, with a line saying it couldn't check what's live, in the words `halonic run` gives for git, and that refusal's fix, dimmed. When it lists routines, it shall end with one dim line saying a routine starts on time only while its workspace is open in Halonic Studio, or while `halonic serve` or `halonic routines watch` is running. A workspace without routines shall say so and how to add one. With `--json`, it shall give each routine's key, hub, id, name, whether it is on, its trigger in words, its next run as ISO time (`null` when it is off, no clock starts it, or it can't start), its schedule's time zone, whether it starts an agent on its own (`startsAgent`), how many errors its file has in the version that runs and in its saved file, its live state, and its last run's id, status and start, and once for the list whether its routines can start here: `trusted`, `true` when the workspace is trusted here or reaches only the test model. It shall start nothing, write nothing and need no trust. It shall exit 1 when a routine's file has errors in the version that runs or a webhook routine can't start, since that routine can't start, and 0 otherwise, empty or not.

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
  then it prints "! 1 routine can't start. The line under the list says why.", then "broken   Invalid file, line 3: use a number and a unit, e.g. "15m", "1h", "1d" (runs are placed from midnight UTC)   ✕ Can't start   Never ran", then "! broken can't start until its file is fixed · halonic validate", and exits 1.
- Given a support routine Friday digest that runs the workflow `weekly-digest`, which the hub doesn't have,
  when `halonic routines --dir .` is run,
  then it prints "! 1 routine can't start. The line under the list says why.", its Next column says "✕ Can't start", the line "! Friday digest can't start until its file is fixed · halonic validate --dir ." follows the list, and it exits 1.
- Given a support routine New mail on a signed web request whose secret mail-hook isn't set, and a routine Agent on request on a signed web request that starts the agent `writer`,
  when `halonic routines --dir .` is run,
  then it prints "! 1 routine can't start. The line under the list says why." for Agent on request and "! 1 routine can't start on a web request · halonic serve --dir ." for New mail, both Next columns say "✕ Can't start", and it exits 1.
- Given that Friday digest routine,
  when `halonic routines --json` is run,
  then its `nextRun` is `null`.
- Given a support routine Daily digest on `0 8 * * 1-5` that runs `{ agent: writer, prompt: Write the digest. }`,
  when `halonic routines` is run on Tuesday 10 Nov 2026,
  then it prints "! 1 routine can't start. The line under the list says why.", its Next column says "✕ Can't start", the line "! Daily digest can't start: Halonic can't run an agent on its own yet, only as a step in a workflow. Make a workflow with the agent as a step, then have the routine start that workflow." follows the list, `--json` gives it `nextRun: null` and `startsAgent: true`, and it exits 0.
- Given support routines Ghost agent that starts the agent `nobody`, which the hub doesn't have, Missing flow that runs the workflow `missing-flow`, which it doesn't have either, and Real agent that starts the agent `writer`,
  when `halonic routines` is run,
  then it prints "! 3 routines can't start. The lines under the list say why.", all three Next columns say "✕ Can't start", and under the list "! Ghost agent can't start until its file is fixed · halonic validate", "! Missing flow can't start until its file is fixed · halonic validate" and Real agent's line that Halonic can't run an agent on its own yet, and it exits 1.
- Given the Acme example,
  when `halonic routines list` is run,
  then it prints the same list as `halonic routines`.
- Given Acme with a provider that reaches a real model, not trusted on this computer, and a Morning check routine that is on, daily at 08:00,
  when `halonic routines` is run,
  then it prints "! Acme isn't trusted on this computer yet, so its routines don't start · halonic trust", then "Morning check Daily at 08:00 ! Paused until trusted Never ran", and exits 0.
- Given that Acme once it is trusted with `halonic trust`,
  when `halonic routines` is run,
  then its Next column says "Next tomorrow 08:00" and no trust line shows.
- Given that Acme with a connector file whose URL has user info,
  when `halonic routines` is run,
  then it prints "! Acme's routines don't start: library/connectors/web.connector.yaml can't be trusted, because the address has a user name or password in it. Fix the address in that file, then trust the workspace with halonic trust.", then the routine as "! Paused until trusted", and exits 0.
- Given Acme not trusted on this computer whose only routine that is on is New mail, on a signed web request whose secret mail-hook isn't set,
  when `halonic routines` is run,
  then it prints "! 1 routine can't start on a web request · halonic serve", its Next column says "✕ Can't start", no trust line shows, and it exits 1.
- Given a routine with the schedule `0 16 * * 5` and `timezone: Europe/Amsterdam`, on a computer in UTC on Tuesday 10 Nov 2026,
  when `halonic routines` is run,
  then its Next column says "Next 13 Nov 16:00 (Europe/Amsterdam)".
- Given a Morning check routine committed on a daily schedule at 08:00 and saved since at 07:00,
  when `halonic routines` is run,
  then the line "! Morning check has changes that aren't live yet. It runs as last committed until you commit them or make them live in Halonic Studio." follows the list, and it exits 0.
- Given that routine only turned off since it was committed,
  when `halonic routines` is run,
  then no such line shows.
- Given a workspace with history where git can't start,
  when `halonic routines` is run,
  then it lists the routines, says "! Couldn't check what's live: git can't start on this computer, so the live version can't be read. This list can't show which routines have changes that aren't live yet.", then "Install git and make sure it's on your PATH, then try again.", and exits 0.
- Given a workspace without routines,
  when `halonic routines` is run,
  then it prints "No routines in Acme yet. Add one as workflows/routines/<id>.routine.yaml in a hub." and exits 0.
- Given a folder without a workspace,
  when `halonic routines` is run,
  then it stops with "✕ Couldn't list the routines in downloads: there's no workspace.yaml here.", exit 4.
