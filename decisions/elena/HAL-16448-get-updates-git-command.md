# Decision: the Get updates refusal for files left to git names the git command and the next step

- Task: HAL-16448 (finding 1 of the c710 check on HAL-16446)
- Approval: team decision on HAL-16448 under HAL-2282 (small wording that builds on the refusal approved in #5219)
- Kind: user-visible
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:IsEvvDvq3iiSXL6wvgxSkkvdka1dqsVf1jwn6NM8n3PoOghAB14IJb4h95WNbOvPcLb3pB7q87RxRsmlBd0mBg==

## What changes

One example of `source-control.get-updates-per-item` changes its refusal text. It used to end
with "Get these updates with git instead." and now goes on: "open a terminal in this
workspace's folder and run git pull --no-rebase. If git reports conflicts, settle them and
commit, then come back here." The refusal still happens in the same cases and still changes
nothing. A new how-to, `docs/how-to/get-updates-for-files-halonic-leaves-to-git.md`, gives the
same steps.

No test is skipped or deleted; the existing test now expects the longer text.

## Why

The old text named no command, folder or next step, so a person who hit it was stuck. The
refusal only happens when both sides moved, and a recent git with no `pull.rebase` setting
refuses a plain `git pull` on divergent branches, so the text names `--no-rebase`.

## Covers

- source-control.get-updates-per-item
