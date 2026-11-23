# Decision: the saved workspace.yaml Local only refusal drops "Nothing started."

- Approval: Liam asked for it in his review of #5246 (HAL-16400, `[minor]`), as follow-up HAL-16670; Liam approves this note in review
- Kind: internal
- Task: HAL-16670, with HAL-16683 bundled (flow check 80, finding c745)

## What changes

`studio.engine-service` quotes the refusal for a saved `workspace.yaml` with an error, when the version
a start reads has Local only off. The old words:

> "The saved workspace.yaml has an error on line 4, so Halonic can't tell whether Local only is on.
> Nothing started."

The new words:

> "The saved workspace.yaml has an error on line 4, so Halonic can't tell whether Local only is on."

The same sentence changes in the requirement's text, in its example of a cancel or an answer that opens
a closed engine, and in `engine-service-saved-local-only.test.ts`, which still checks the same refusal,
its kind, its fix and that nothing is sent. The fix, "Fix the error in workspace.yaml, then try again.",
stays.

## Why

Words check C739 (HAL-16658) dropped "Nothing ran." from Studio's start refusals because each start
screen's lead already says the run didn't start. The same holds here, and the sentence also reads oddly
on a cancel or an answer, which open the engine the same way and start nothing.

## Also: a next step for a folder whose history lies outside (HAL-16683)

`studio.page-versions` refused a folder with its own `.git` that the shell won't open, such as a git
worktree, with only "This folder's history lies outside the folder you opened, so it can't be read.",
which leaves the person no way on. The refusal keeps that sentence and now gives the next step
"Open the folder that holds the repository instead, or run it with halonic in a terminal." The
requirement names both, with a new example, and `page-versions.test.ts` checks the step too. Nothing
is weakened: the refusal, its kind and that the saved files are never read stay as they were.

## Covers

- studio.engine-service
- apps/studio/src/engine/engine-service-saved-local-only.test.ts
- studio.page-versions
- apps/studio/src/engine/page-versions.test.ts
