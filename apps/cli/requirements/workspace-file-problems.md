# cli.workspace-file-problems

- Status: active
- Since: unreleased
- Source: HAL-6613, item 2 of HAL-6585 (found by Sofia on HAL-6556); the words are the team's call, built on doctor's Workspace line and run's Couldn't line. `halonic test`, and `run` refusing before it looks the workflow up: HAL-12978 (found by Nina on HAL-12974); naming the files: HAL-15119 (C544-3, found by Iris on HAL-15101); which errors stop which run: HAL-15127 (Liam's decision, the rule `workspace.run-problems` that Studio's Run shares); a routine's own file and `routines watch`: HAL-15372 (C565 row 1, HAL-15351); "See it with" for one problem: HAL-15548 (C591 row 17 on HAL-15531); a fix saved but not live, HAL-16057 (C666 #2 on HAL-16045), in the words `halonic routines` gives a routine's fix (`cli.commands.routines.list-live-version`)

When the workspace's files have errors, as `halonic validate` finds them, `halonic routines watch` and `halonic test` shall start nothing and run no test (`halonic routines watch` counting only the errors outside the routine files: a routine whose own file has errors is left out of the watch, and the others start, as `cli.commands.routines.watch` says, since a routine's file adds nothing to what the trust check reads), and `halonic run` and `halonic runs send` shall start nothing and send nothing while an error stops the run's workflow, as `workspace.run-problems` gives it (for `run`, every error when no hub, or more than one, has the workflow), before the trust check and, for `run`, before it looks the workflow up, so a workflow whose own file has an error is never reported missing, and end with the `invalid_input` kind (exit 2), as for any file the user gave that is wrong. Line 1 shall say how many of those problems the workspace has and in which files, "Acme has 2 problems in providers/mock.yaml.", naming two files as "a.yaml and b.yaml" and three or more as the first file "and 2 other files", in the order `halonic validate` lists them, or "in its files" when none of those errors is in a file, then "Nothing ran." (or "Nothing was sent."), and line 2 "See it with: halonic validate" for one problem and "See them with: halonic validate" for more, with the user's `--dir`. `halonic run`, `halonic runs send` and `halonic routines watch` read the live version, the last commit, while `halonic validate` reads the saved files; so when those errors are in the live version and the saved files, read with the same rule, have none of them, line 1 shall instead say "Acme's last commit has 1 problem in models.yaml, and its fix isn't live yet." ("2 problems …, and their fixes aren't live yet."), then "Nothing ran." (or "Nothing was sent."), and line 2 "Commit the fix or make it live in Halonic Studio, then try again." ("Commit the fixes or make them live …" for more), with the same kind and exit code. The saved files are read only when the live version has such an error; saved files that can't be read keep the line that points to `halonic validate`. `halonic doctor` shall mark the Workspace line ✕ with "Acme · 2 problems in its files · halonic validate" and exit 1. A file with an error is left out of the loaded workspace, so a workspace with any is never taken as reaching the test model only. Only errors count; warnings leave no file out. Neither command shall repeat the problems themselves, only the files' paths, so a key pasted into a file never shows.

## Examples

- Given the Acme example with `providers/anthropic.yaml` holding a key pasted as its `secret`, the alias smart on it and `model: smart` on Writer,
  when `halonic run support-reply` runs,
  then it prints, counting the pasted key but not the alias whose provider is left out (that file's own error says what to fix), "✕ Couldn't run support-reply: Acme has 1 problem in providers/anthropic.yaml. Nothing ran." and "  See it with: halonic validate", exits with 2, stores no run and never prints the key.
- Given the Acme example with `version: 2` added to `hubs/support/workflows/support-reply.workflow.yaml`,
  when `halonic run support-reply` runs,
  then it prints "✕ Couldn't run support-reply: Acme has 1 problem in hubs/support/workflows/support-reply.workflow.yaml. Nothing ran." and "  See it with: halonic validate", not that there's no workflow called "support-reply", and exits with 2;
  and when `halonic test` runs, it prints the same two lines after "Couldn't test acme:" and exits with 2.
- Given the Acme example with `agent: ghost` in `hubs/reports/workflows/weekly-report.workflow.yaml`,
  when `halonic run support-reply` runs, then it runs;
  and when `halonic run weekly-report` runs, it prints "✕ Couldn't run weekly-report: Acme has 1 problem in hubs/reports/workflows/weekly-report.workflow.yaml. Nothing ran." and exits with 2.
- Given the Acme example with `version: 2` added to `hubs/support/hub.yaml`, `hubs/reports/hub.yaml`, or a workflow support-reply calls,
  when `halonic run support-reply` runs,
  then it prints "Acme has 1 problem in" that file; with `hub.yaml`, the error in `support-reply.workflow.yaml` and the pasted key, it prints "Acme has 3 problems in *the first file* and 2 other files." and "  See them with: halonic validate".
- Given the Acme example with a routine Friday digest whose `workflow:` names a workflow the hub doesn't have,
  when `halonic routines watch` runs,
  then it doesn't stop for that file: it prints "✕ Friday digest can't start until its file is fixed · halonic validate" and runs the other routines on time;
  and given `version: 2` added to a workflow file `hubs/support/workflows/spare.workflow.yaml` instead, it prints "✕ Couldn't watch the routines in acme: Acme has 1 problem in hubs/support/workflows/spare.workflow.yaml. Nothing ran." and "  See it with: halonic validate", and exits with 2.
- Given the Acme example under git whose last commit has `provider: mocky`, a provider Acme doesn't have, for the default alias in `models.yaml`, and the saved `models.yaml` fixed back to `provider: mock`,
  when `halonic run support-reply` runs,
  then `halonic validate` finds no problems, and the run prints "✕ Couldn't run support-reply: Acme's last commit has 1 problem in models.yaml, and its fix isn't live yet. Nothing ran." and "  Commit the fix or make it live in Halonic Studio, then try again.", and exits with 2;
  and with the saved file changed to `provider: mockz` instead, it prints "Acme has 1 problem in models.yaml." and "  See it with: halonic validate".
- Given the same workspace with a run of Support reply waiting,
  when `halonic runs send 01jd8q approve` runs,
  then it ends "Nothing was sent.", exits with 2 and adds nothing to the run.
- Given the Acme example with `type: antropic` in `providers/mock.yaml`, or with `defaults.model: smart` in `workspace.yaml` and no alias smart,
  when `halonic run support-reply` runs,
  then it prints "Acme has 1 problem in providers/mock.yaml." (or "1 problem in hubs/support/agents/sorter.agent.yaml": of the problems on one agent's file per hub whose workflow runs an agent without a model, only the support hub's stops support-reply) and exits with 2, where it used to start and fail with exit 4 (HAL-14260).
- Given a workspace whose provider file has a key pasted as its `secret` and on an `apiKey:` line,
  when `halonic doctor --dir acme` runs,
  then the Workspace line is "✕ Workspace   Acme · 1 problem in its files · halonic validate --dir acme", it exits with 1 and never prints the key.
