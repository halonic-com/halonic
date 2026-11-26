# Decision: no unneeded-rebase note on a repository without a merge queue

- Task: HAL-19791 (follows HAL-15359 and HAL-18722)
- Approval: the task asks for this change; Liam approves this note in review on HAL-19791
- Kind: internal

## Covers

- paperclip.pr-watcher-unneeded-rebase

## What changes

`paperclip.pr-watcher-unneeded-rebase` gains one exception: the PR watcher doesn't note "unneeded rebase after approval" for a pull request on a repository without a merge queue. The repositories with a queue are listed in `mergeQueueRepos` in `tooling/paperclip/src/pr-watcher/unneeded-rebase.ts`; today only `halonic-com/halonic`. The "pushed after approval" handling is unchanged.

## Why

`halonic-com/cloud` has no merge queue (Team plan), and its branch rule needs the branch up to date with `main`, so a pull request behind `main` can't merge. There a rebase after the approval is needed, and the note told authors to skip it (HAL-19573, 26 Nov). A fixed list matches `githubReviewRepos` in `facts.ts`; reading the queue from GitHub on every pass would add a query for one fact that changes only with the plan.
