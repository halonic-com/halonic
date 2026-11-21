# Decision: one rule for which errors stop a run, shared by the CLI and Studio, and the refusal names the files

- Approval: /HAL/issues/HAL-15127 (Liam's decision: option 3, one shared rule in `@halonicjs/workspace`, with his additions), from /HAL/issues/HAL-15119 (Iris's flow check C544, items 1 and 2: "at the least name the file in the CLI line", and the band "never says to fix it, unlike the start card"); the refusal's and the band's wording decided by the team, built on the approved Couldn't line and the start card's words
- Kind: user-visible

**Which errors stop a run.** The CLI refused every run while any file had an error (HAL-6613), and Studio made Run unavailable only for errors in the workflow's own file and its agents' files. So with `weekly-report` broken, Studio ran `support-reply` and `halonic run support-reply` refused it. Now both ask one function, `errorsStoppingRun` in `@halonicjs/workspace` (requirement `workspace.run-problems`): a run of workflow W is stopped by an error in W's own file, in an agent or workflow W uses (followed down through the workflows it calls) and their subagents (followed down too, as a run loads them and hands them tasks), in any other file that isn't a workflow, agent or test file (`workspace.yaml`, hubs, providers, `models.yaml` and so on), or in no file. A file's kind comes from its path, and where that can't tell, the error stops the run. The default model problem stops W when an agent or a subagent W uses calls the default model. The sandbox gate still reads only the agents W's steps name; widening it to subagents would be a security change of its own. HAL-6613's reason holds: a file with an error is left out when the workspace loads, and that only changes a run that loads it. `halonic test` and `routines watch` run every workflow, so any error still stops them; `validate` and `doctor` still list every error.

**What changes for the requirements.** `cli.workspace-file-problems` says that `run` and `runs send` refuse for the errors that stop the run's workflow, and its examples change: a broken `weekly-report` no longer stops `support-reply`, and a missing default alias stops it for its own hub's agents only ("1 problem", not "2"). `studio.workspace-workflows` says a workflow has the errors elsewhere that stop its run, not only its agents'. In Studio, an error in a provider, `workspace.yaml`, a hub file, a called workflow or the default alias now makes Run unavailable, where it didn't before; a folder without `workspace.yaml` stops every run, in Studio as in the CLI.

**The refusal names the files.** Line 1 said only "Acme has 1 problem in its files." It now names the files that stop the run: one or two by path, three or more as the first and "and 2 other files", in the order `halonic validate` lists them; when none of those errors is in a file, it keeps "in its files". The count, the exit code, the fix line and `doctor` stay as they are, and the problems themselves are still not repeated, so a key pasted into a file never shows.

**Studio's band.** The workflow page's problems band ("Support reply can't run: it has 2 problems.") never said what to do, while the start card did. It now has the start card's own words as its second line, "Fix them before it can run." ("Fix it …" for one). Its first line, that the problems stop the workflow, a terminal's run too, is now true, as both count the same errors.

## Covers

- cli.workspace-file-problems
- cli.commands.test.run-tests
- workflows.start.start-run
- studio.workspace-workflows
