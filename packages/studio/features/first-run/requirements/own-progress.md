# first-run.own-progress

- Status: draft
- Since: unreleased
- Source: HAL-14646 (UX check L6, HAL-12721); the board on HAL-12723; flow-first-run 5.2; Liam's plan review on HAL-14646

While the open workspace isn't the sample, the First Run feature shall work out which steps of **Get set up** are done. Step 1, **Connect your own model**, shall be done once the `default` alias of `models.yaml` points at a provider that isn't the built-in test model (`type: mock`) and either is marked `local: true` and answers the provider check, or is a cloud provider whose key is saved under its `secret` while the workspace isn't local only; while `privacy.localOnly` is on, a cloud provider shall not count, even with its key saved, because Models blocks it. The test model shall never count. A local provider that doesn't answer shall leave step 1 not done and say where it was asked, for the row's problem state. Step 2, **Make your first agent**, shall be done once the workspace has an agent. Step 3, **Run it once**, shall be done once any run (`kind: "run"`, not a test) in the workspace has finished with `status: "completed"`, whichever workflow it ran, since an agent mostly runs as a workflow's step; a failed run, or one that couldn't try, shall not count. A file that can't be read at all shall make the step's check fail rather than read as not done; a file that doesn't parse shall read as missing. The card shall show while steps are left. When all three are done, it shall stay for that visit and be gone the next time Home opens, which this device remembers per folder. If all three are already done the first time the card is worked out for a folder, it shall be remembered as finished and never show.

## Examples

- Given a new workspace, whose `default` alias is on the test model,
  when step 1 is worked out,
  then it isn't done.
- Given `default` on a cloud provider whose key is saved, in a workspace that isn't local only,
  when step 1 is worked out,
  then it's done.
- Given the same provider and key, in a workspace with `privacy.localOnly: true`,
  when step 1 is worked out,
  then it isn't done.
- Given `default` on a local Ollama that answers,
  when step 1 is worked out,
  then it's done, also while the workspace is local only.
- Given `default` on a local Ollama that doesn't answer,
  when step 1 is worked out,
  then it isn't done, and the step names `localhost:11434`.
- Given a workspace with one agent,
  when step 2 is worked out,
  then it's done.
- Given only a failed run and a finished test,
  when step 3 is worked out,
  then it isn't done; a finished run of any workflow makes it done.
- Given a folder whose card was never worked out and that has all three done,
  when Home opens,
  then the card doesn't show, and it doesn't show on later visits either.
- Given a card with steps left on the last visit,
  when all three get done during this visit,
  then the card stays for this visit and is gone the next.
