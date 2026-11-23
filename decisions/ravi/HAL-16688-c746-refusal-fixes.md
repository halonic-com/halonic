# Decision: a step for the worktree refusal, and no "Nothing started." after Local only's refusal

- Approval: design check C746 rows 1 and 2 (HAL-16681), a team decision on an approved screen under HAL-2282; Liam approves this note in review
- Kind: user-visible
- Task: HAL-16688

## What changes

Both sentences are unreleased (#5349, #5246).

**C746 row 1.** In a folder that keeps its git files outside it, such as a git worktree, Run, the
Inbox form and Run now said "This folder's history lies outside the folder you opened, so it can't
be read." with no step, so the screens offered **Try again**, which refused the same way every time.
Words check C744 row 12 (HAL-16686, #5368, merged while this was in review) gave the sentence
"This folder keeps its git files outside it, as a git worktree does, so Studio can't read its
versions." and the fix "Open the repository's own folder, with its .git folder inside it, or clone
the repository into a folder of its own." This change keeps that sentence, and that fix wherever
there is no workflow to run. `halonic run` reads that repository (HAL-16298), so a start of a
workflow gets the terminal's step instead. In `studio.engine-service`, after the sentence on git
that can't be found:

> When the folder keeps its git files outside it, such as in a git worktree, a start shall be
> refused as `unavailable` with "This folder keeps its git files outside it, as a git worktree
> does, so Studio can't read its versions." (words check C744 row 12, HAL-16686); a start of a
> workflow shall give, as for a connector, the sentence "To run it from this folder, run this in a
> terminal:" with the command that starts it, `halonic run reply`, since `halonic run` reads that
> repository (HAL-16298, design check C746 row 1, HAL-16688), and a routine's start of an agent the
> fix "Open the repository's own folder, with its .git folder inside it, or clone the repository
> into a folder of its own.", since `halonic run` starts no single agent.

and an example for it. `page-versions.test.ts` stays as #5368 left it, and still checks
that the folder is refused, not read as history off. The worktree changeset now names the command.

**C746 row 2.** Every screen's lead already says the run didn't start, and a cancel or an answer
that opens a closed engine starts nothing, so "Nothing started." goes from the saved `workspace.yaml`
refusal. In `studio.engine-service`, in the Local only sentence and in its example, the old words:

> "The saved workspace.yaml has an error on line 4, so Halonic can't tell whether Local only is on.
> Nothing started."

The new words:

> "The saved workspace.yaml has an error on line 4, so Halonic can't tell whether Local only is on."

The refusal moved to `@halonicjs/app` with #5366 (HAL-16406, merged while this was in review), so
the CLI gives the same words, after its own lead "✕ Couldn't run …:", which says so too. The
example of `app.saved-local-only` changes the same way, line 2 in place of line 4.

`engine-service-saved-local-only.test.ts`, the app's `saved-local-only.test.ts` and the CLI's
`run-workspace-saved-local-only.test.ts` expect the new words. No test, example or requirement
goes, and none is skipped.

## Covers

- studio.engine-service
- app.saved-local-only
- apps/studio/src/engine/engine-service-saved-local-only.test.ts
- packages/core/app/src/saved-local-only.test.ts
- apps/cli/src/run-workspace-saved-local-only.test.ts
