# Decision: Get updates refuses to start when the shared copy changed a file Halonic leaves to git

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16343 (triaged on HAL-16327: refuse, or list these paths)
- Kind: user-visible

Get updates starts with `merge -s ours`, which keeps this workspace's side of every file, and then
writes in what only the shared copy changed. It never writes a file Halonic leaves to git (a private
file such as `.env.example`, or a name with `:` or with `~` and a digit), so the shared copy's change
to such a file was dropped without a word, and Finish recorded this side's file, taking the other
person's change back for everyone.

Starting now refuses, changing nothing, when the shared copy changed such a file, and names the
files: "updates change files Halonic leaves to git: .env.example. Get these updates with git
instead." The person gets those updates with git. This side's own changes to such files still
don't stop the merge: keeping them is right. Halonic's own folders (`.halonic/review`, per device)
are still left out as before.

The requirement `source-control.get-updates-per-item` gains this refusal and an example. The test
"leaves Halonic's own folders and private files out of the merge" had both sides change `.env`;
that case is now refused, so the test keeps the review folder and this side's own `.env` change,
and a new test covers the refusal. No test was weakened: the refusal is checked more strictly than
the old case was.

## Covers

- source-control.get-updates-per-item
- apps/studio/src/changes/workspace-merge.test.ts
