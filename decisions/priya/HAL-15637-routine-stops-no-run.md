# Decision: a routine's error stops no run

- Approval: /HAL/issues/HAL-15637 (C605 #1, found on /HAL/issues/HAL-15625; the fix the task proposes, decided by the team as an exception to the shared rule of /HAL/issues/HAL-15127)
- Kind: user-visible

**What was wrong.** `workspace.run-problems` stops a run of workflow W for an error in any file that isn't a workflow, agent or test file, because every run may depend on such a file: a provider, `models.yaml`, a hub file. Routines fell under that rule too. So in Acme, the paused routine Nightly check, which starts `support-reply` without the `mail` its first step reads, made Weekly report in another hub and Handbook fix, which doesn't use `support-reply` at all, say "can't run: it has 1 problem", with Run unavailable, and `halonic run` refused them the same way.

**The rule now.** An error in a routine's file, a hub's or the workspace's, stops no run, even a run of the workflow that routine starts. A run never loads a routine: a routine only starts runs. A routine with an error is the routine that can't start, as the Routines list already says ("Can't start"), and `halonic routines watch` still starts nothing while any file has an error. We chose this over "it stops only the workflow it starts": the workflow itself is sound, and a user who runs it by hand gives it its own input. `validate` and `doctor` still list every error.

**What changes for the requirements.** `workspace.run-problems` names routines next to test files as files whose errors stop no run, with an example from C605. `cli.workspace-file-problems` and `studio.workspace-workflows` refer to that rule and need no edit; a CLI test and a Studio test now rebuild C605's case.

## Covers

- workspace.run-problems
