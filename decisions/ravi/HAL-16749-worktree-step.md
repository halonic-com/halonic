# Decision: the worktree refusal names the repository's own folder, not `halonic run`

- Approval: words check C744 row 12 (HAL-16686) and finding C757 (HAL-16749), a team decision on an approved screen under HAL-2282; Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:9VIiHmbw8mY4eC+ozpjDfyNcA9hqVMm7U4BtBoYniyS+AZruMETw4s1HM6gqnltdutYe10ljFtgP+xtVHAwwAg==

## What changes

The step is unreleased (#5371). In a folder that keeps its git files outside it, such as a git
worktree, a start of a workflow said "To run it from this folder, run this in a terminal:" with
`halonic run reply`, since `halonic run` was thought to read that repository (HAL-16298). It
doesn't: `halonic run` refuses that folder too ("keeps its git files outside the folder, which
Halonic doesn't allow", `git.repository-refused`, and `apps/cli/README.md` says so), so the step
sent people to a command that refuses them the same way (C757, HAL-16749).

Every start now keeps the fix words check C744 row 12 gave, "Open the repository's own folder,
with its .git folder inside it, or clone the repository into a folder of its own.", as a routine's
start of an agent already did. An `unavailable` refusal with a fix shows as a refusal, without
**Try again** (`startRefusalOf`), so design check C746 row 1 still holds. In
`studio.engine-service`, the old words:

> (words check C744 row 12, HAL-16686); a start of a workflow shall give, as for a connector, the
> sentence "To run it from this folder, run this in a terminal:" with the command that starts it,
> `halonic run reply`, since `halonic run` reads that repository (HAL-16298, design check C746
> row 1, HAL-16688), and a routine's start of an agent the fix "Open the repository's own folder,
> with its .git folder inside it, or clone the repository into a folder of its own.", since
> `halonic run` starts no single agent.

The new words:

> and the fix "Open the repository's own folder, with its .git folder inside it, or clone the
> repository into a folder of its own." (words check C744 row 12, HAL-16686), for a workflow's
> start and a routine's start of an agent alike, and no terminal command, since `halonic run`
> refuses that folder too (HAL-16749).

Its example now expects that fix and no command. The code goes back to how #5368 left it:
`historyOutsideRefusal` and the workflow passed to `pick` go, and `page-versions.test.ts` still
checks the refusal and its fix. The test #5371 added to `page-run-versions.test.ts` checked the
command, so it goes with it. The worktree changeset goes back to naming the folder to open.

## Covers

- studio.engine-service
- apps/studio/src/engine/page-run-versions.test.ts
