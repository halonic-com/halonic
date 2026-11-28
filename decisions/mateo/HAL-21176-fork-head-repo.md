# Decision: the deployment approval's preview names a fork's head repository

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-21176
- Kind: user-visible

## What changes

`action-catalog.github-approve-deployment` gets three additions; nothing is
removed or weakened, and every existing example still holds.

1. The run check also keeps `head_repository.full_name` (a dotted keep of 2
   segments). When it isn't `{owner}/{repo}`, compared without case, the
   preview names the fork: "commit `4f2c9e1` on `main` of the fork
   `outsider/app`". When GitHub names no head repository (a deleted fork), the
   preview says so. The stepper names such a run; it doesn't refuse it.
2. After an environment id/name mismatch, the preview no longer pairs GitHub's
   name with the request's `environment_id`: it says the two differ and names
   the approved environment by its id only. The gate still stops the approval.
3. A new example: `parse` refuses `environment` set to `.` or `..`. The
   parameters already refused them (`strictParameters` refuses those
   segments for every text parameter), so this only records it.

The four recorded run answers gain the `head_repository` and `repository`
objects a real GitHub answer has, and a fifth recording, `fork-run.json`, is
a pull request run from a fork.

## Why

Julian's security review of halonic#6951 (HAL-17522): for a run from a fork's
pull request, `head_branch` is the fork's own branch, named by whoever opened
the pull request (GHSL-2025-099), so "on `main`" read as the repository's own
`main`. The preview is all the user reads before an irreversible approval
that lets the fork's code run in the environment's job.

The task offered refusing fork runs instead. Naming the fork keeps the
legitimate case (a maintainer approving a contributor's deployment on
purpose) while making it visible. Refusing could follow later as a new
version if the board wants it.

## Covers

- action-catalog.github-approve-deployment
