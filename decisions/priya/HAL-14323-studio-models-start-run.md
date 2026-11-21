# Decision: Studio checks agents against models.yaml, and Start run says when the workflow has errors

- Task: HAL-14323
- Approval: team decision under the HAL-2282 rule for a fix and a fallback state on approved Studio screens (Liam, on HAL-14323; wording from Sofia's c343 check on HAL-14274, rows S12 and X2); Liam reviews the pull request on HAL-14323 and signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:SCSjM6pt86fDte0pmkhRj/9QYtXvBrkx8dXsXG9mWqiHtsWjvQSuDYvahv+6kx+GOCHWC2Te5/pbs2fiC7hPAw==

## What changes

**S12 (ST1).** Studio's checks read only `hubs/`, `library/`, `agents/` and `workflows/`, never `models.yaml` or `providers/`. So every agent with `model: <alias>` showed "Agent "writer" uses unknown model alias "default"", and the Files tree marked it red, though `halonic validate` found nothing. The Files tree's problems, the Workflows list and a workflow's Configuration now read the same places `halonic validate` does: the first folder of every place a kind's file can sit, and the files a kind keeps at the workspace root (`workspace.yaml`, `models.yaml`, `deployments.yaml`). The list comes from the kinds, so a new kind is checked without a change in Studio. The Library's rows and their "Used by" keep their own folders, so no Library rows are added. An alias that `models.yaml` doesn't have is still an error.

The requirement `studio.workspace-files-host` says the files are checked as `halonic validate` checks them.

**X2 (ST6).** A workflow's problems now also hold the errors in the files of the agents its steps name, because such an agent can't run and so neither can the workflow. The agents' warnings stay on their own files. The requirement `studio.workspace-workflows` says so.

The Start a run card offered **Start run** while the same screen said "Configuration 2". With errors, the card now shows a danger Callout in place of **Start run**: "Support reply has 2 problems. Fix them before it can run." ("has 1 problem. Fix it before it can run." for one) with **Open Problems**, which closes the card and opens Configuration on Problems. Warnings don't stop a run. The requirement `workflows.start.start-run` says so and gains two examples.

New tests cover a valid alias with no problem (the Files tree and the workflow), an alias that is really missing, and the card with an error, with one error, with only a warning and with none. No test was skipped or removed.

## Why

A false error on every agent made the Files tree and the workflow's problem count untrustworthy, and it hid the real ones. A **Start run** that the same screen says can't work leads to a failed run instead of the fix. Both are a fix and a fallback state on screens the board already approved, with wording from Sofia's c343 "What it should say" column, so the team decides (HAL-2282). Chief lists it under "Decided by the team".

## Covers

- studio.workspace-files-host
- studio.workspace-workflows
- workflows.start.start-run
