# Decision: the deployment approval's own line names a fork's head repository

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-21205
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:euc1ocYTsmkdDUZvKy5xdP7Jp//OSLcCkYVjkU8gg1TdZVq7eRr6Gq/HI/HCRcdJjOVx2ypmrkT1U3ym2QSyDA==

## What changes

`action-catalog.github-approve-deployment` gets two additions; nothing is
removed or weakened, and every existing example still holds.

1. Once the run check has answered, the approval's line (step 3) names the
   run's head repository when it isn't `{owner}/{repo}`, compared without
   case, or when GitHub named none: "Approves run 7001 of acme/app, a commit
   of the fork `outsider/app`, for the environment `production`. …". For the
   request's own repository the line is unchanged.
2. When GitHub answers `head_branch: null` (its schema allows it), the run
   line still names the short commit, the head repository and who started
   it, without a branch, instead of falling back to "Reads run … on GitHub".

Two new examples record both, with the replayed `fork-run.json`.

## Why

Julian's security sign-off of halonic#6968 (HAL-21176): each step shows only
its own line, and the alert dialog confirming the irreversible approval shows
step 3's line alone, so the fork wasn't in the text the user reads at the
final click. A null `head_branch` dropped the commit and the fork from the
run line as well.

## Covers

- action-catalog.github-approve-deployment
