# Decision: the CLI says when Local only comes from the saved workspace.yaml

- Approval: flow check C755 findings 1 and 2 (HAL-16720), a team decision on an approved flow under HAL-2282; Liam approves this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:u65TRla6QqkR8yYZYU2jKRSQnFpGhao3l3muWJY5VMwzJz+N7c8w0UAgiXhAo4xaqsYa3iIZqnY3BQs+xsegDg==
- Task: HAL-16723

## What changes

`app.saved-local-only` is unreleased (#5366).

**C755 finding 1.** With Local only saved on but not live, `halonic run` opened with "Your
uncommitted changes aren't used. Commit them to run them." and then refused because of that
uncommitted change: "Acme is local only, so Halonic sent nothing to Cloud model." The live file
says `false`, so the person couldn't tell why. Now, when Local only is on only because of the saved
file, the first line reads "Your uncommitted changes aren't used, except that your saved
workspace.yaml turns local only on, so this run uses local models only. Commit the rest to run
them.", the refusal reads "Acme is local only because your saved workspace.yaml turns it on, even
before it's live, so Halonic sent nothing to Cloud model.", and its fix ends "or set
privacy.localOnly back to false in workspace.yaml (no commit needed)." With the live version off, setting the saved file
back to false counts at once, so the fix doesn't ask to make it live. When the live version has
Local only on, the refusal stays as it was: turning it off then waits for Make live, which the
run's own "uncommitted changes aren't used" line already says.

**C755 finding 2.** A watch refused a run saved on during the watch with "This version of acme
turns local only on or off", though the saved file isn't a version. Now it reads "Your saved
workspace.yaml turns local only on, which counts even before it's live, but a running watch can't
change local only. Stop the watch and start it again to run the routine.", and, for a watch that
started with it saved on, "Your saved workspace.yaml turns local only back off, and a running
watch can't change local only. …". A new commit keeps the version line. The words are Sofia's
(words check, HAL-16726).

In `app.saved-local-only`, a new paragraph after the one on the commands:

> When Local only is on only because of the saved file, `halonic run` shall say so (C755): its
> line about uncommitted changes shall name Local only as the one change it uses, and a run
> refused for a cloud model shall say Local only comes from the saved `workspace.yaml`, which
> isn't live yet, and that setting it back to false there counts, since the live version has it
> off. A watch's refusal shall name the saved `workspace.yaml`, not a version, when the saved file
> turned Local only on, or off again.

The watch example's quoted words change from "turns local only on or off" to "Your saved
workspace.yaml turns local only on, which counts even before it's live", and a new example covers
`halonic run`. The watch test's refusal string changes the same way; no test is removed.

**C755 finding 3, not changed.** The CLI's worktree refusal names the repository's own folder; the
Studio's doesn't. To name it, the Studio would have to read the worktree's `.git` file, which the
shell doesn't open (HAL-16298): a change to the native shell, out of proportion for a small
difference in wording. The Studio's fix already says which folder to open.

## Why

The flow check found two lines that contradict each other, and a refusal that doesn't say where
its setting comes from. Saying "saved, not yet live" where Local only comes from the saved file is
the fix the check asked for.

## Covers

- app.saved-local-only
