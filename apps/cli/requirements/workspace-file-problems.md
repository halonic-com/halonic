# cli.workspace-file-problems

- Status: active
- Since: unreleased
- Source: HAL-6613, item 2 of HAL-6585 (found by Sofia on HAL-6556); the words are the team's call, built on doctor's Workspace line and run's Couldn't line. `halonic test`, and `run` refusing before it looks the workflow up: HAL-12978 (found by Nina on HAL-12974); naming the files: HAL-15119 (C544-3, found by Iris on HAL-15101); which errors stop which run: HAL-15127 (Liam's decision, the rule `workspace.run-problems` that Studio's Run shares); a routine's own file and `routines watch`: HAL-15372 (C565 row 1, HAL-15351)

When the workspace's files have errors, as `halonic validate` finds them, `halonic routines watch` and `halonic test` shall start nothing and run no test (`halonic routines watch` counting only the errors outside the routine files: a routine whose own file has errors is left out of the watch, and the others start, as `cli.commands.routines.watch` says, since a routine's file adds nothing to what the trust check reads), and `halonic run` and `halonic runs send` shall start nothing and send nothing while an error stops the run's workflow, as `workspace.run-problems` gives it (for `run`, every error when no hub, or more than one, has the workflow), before the trust check and, for `run`, before it looks the workflow up, so a workflow whose own file has an error is never reported missing, and end with the `invalid_input` kind (exit 2), as for any file the user gave that is wrong. Line 1 shall say how many of those problems the workspace has and in which files, "Acme has 2 problems in providers/mock.yaml.", naming two files as "a.yaml and b.yaml" and three or more as the first file "and 2 other files", in the order `halonic validate` lists them, or "in its files" when none of those errors is in a file, then "Nothing ran." (or "Nothing was sent."), and line 2 "See them with: halonic validate", with the user's `--dir`. `halonic doctor` shall mark the Workspace line ✕ with "Acme · 2 problems in its files · halonic validate" and exit 1. A file with an error is left out of the loaded workspace, so a workspace with any is never taken as reaching the test model only. Only errors count; warnings leave no file out. Neither command shall repeat the problems themselves, only the files' paths, so a key pasted into a file never shows.

## Examples

- Given the Acme example with `providers/anthropic.yaml` holding a key pasted as its `secret`, the alias smart on it and `model: smart` on Writer,
  when `halonic run support-reply` runs,
  then it prints, counting the pasted key but not the alias whose provider is left out (that file's own error says what to fix), "✕ Couldn't run support-reply: Acme has 1 problem in providers/anthropic.yaml. Nothing ran." and "  See them with: halonic validate", exits with 2, stores no run and never prints the key.
- Given the Acme example with `version: 2` added to `hubs/support/workflows/support-reply.workflow.yaml`,
  when `halonic run support-reply` runs,
  then it prints "✕ Couldn't run support-reply: Acme has 1 problem in hubs/support/workflows/support-reply.workflow.yaml. Nothing ran." and "  See them with: halonic validate", not that there's no workflow called "support-reply", and exits with 2;
  and when `halonic test` runs, it prints the same two lines after "Couldn't test acme:" and exits with 2.
- Given the Acme example with `agent: ghost` in `hubs/reports/workflows/weekly-report.workflow.yaml`,
  when `halonic run support-reply` runs, then it runs;
  and when `halonic run weekly-report` runs, it prints "✕ Couldn't run weekly-report: Acme has 1 problem in hubs/reports/workflows/weekly-report.workflow.yaml. Nothing ran." and exits with 2.
- Given the Acme example with `version: 2` added to `hubs/support/hub.yaml`, `hubs/reports/hub.yaml`, or a workflow support-reply calls,
  when `halonic run support-reply` runs,
  then it prints "Acme has 1 problem in" that file; with `hub.yaml`, the error in `support-reply.workflow.yaml` and the pasted key, it prints "Acme has 3 problems in *the first file* and 2 other files.".
- Given the Acme example with a routine Friday digest whose `workflow:` names a workflow the hub doesn't have,
  when `halonic routines watch` runs,
  then it doesn't stop for that file: it prints "✕ Friday digest can't start · halonic validate" and starts the other routines;
  and given `version: 2` added to a workflow file `hubs/support/workflows/spare.workflow.yaml` instead, it prints "✕ Couldn't watch the routines in acme: Acme has 1 problem in hubs/support/workflows/spare.workflow.yaml. Nothing ran." and "  See them with: halonic validate", and exits with 2.
- Given the same workspace with a run of Support reply waiting,
  when `halonic runs send 01jd8q approve` runs,
  then it ends "Nothing was sent.", exits with 2 and adds nothing to the run.
- Given the Acme example with `type: antropic` in `providers/mock.yaml`, or with `defaults.model: smart` in `workspace.yaml` and no alias smart,
  when `halonic run support-reply` runs,
  then it prints "Acme has 1 problem in providers/mock.yaml." (or "1 problem in hubs/support/agents/sorter.agent.yaml": of the problems on one agent's file per hub whose workflow runs an agent without a model, only the support hub's stops support-reply) and exits with 2, where it used to start and fail with exit 4 (HAL-14260).
- Given a workspace whose provider file has a key pasted as its `secret` and on an `apiKey:` line,
  when `halonic doctor --dir acme` runs,
  then the Workspace line is "✕ Workspace   Acme · 1 problem in its files · halonic validate --dir acme", it exits with 1 and never prints the key.
