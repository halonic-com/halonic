# app.run-proposal-history-off

- Status: active
- Since: 0.1.0
- Source: req-workspace `app.run-proposal-history-off`; engine answer 2 on HAL-3267 ("history off"); plan on HAL-3248 (approved on HAL-5271)

When history is off, a run that can write files shall get a copy of the saved files in Halonic's data folder, made of two sides: a base left as the workspace was at the start, and the run's side, the only folder it writes in. The copy shall leave out what Accept may never write (`.git/`, `.halonic/`) and what the workspace store won't serve. At the run's end, the proposal shall be the files the run added, deleted or modified, in the same record shape as with history on, with no commit and no ref, each with the digest of its base. Both sides shall then keep only those files, and nothing when the run changed nothing. Accept, its parts and changes, Compare, Reject, Undo, settle, the 30 days and unavailable shall work as with history on. A proposal shall be read from its own kind of texts whatever the setting is later. When the workspace has more files or bytes than a copy may hold, the run shall fail at start, saying the workspace is too big to run with history off and that history can be turned on or a smaller folder opened, and leave no copy.

## Examples

- Given history is off and run `01JD8Q` changed `agents/clerk.agent.yaml`,
  when it ends,
  then its proposal lists that file as modified with the digest it had at the start, and Accept writes it while the saved file still has that digest.
- Given history is off and run `01JD8Q` added `notes/today.md` and deleted `agents/old.agent.yaml`,
  when it ends,
  then its proposal lists the first as added, with no base, and the second as deleted, with its digest.
- Given history is off and the person changed `agents/clerk.agent.yaml` after run `01JD8Q` started,
  when they accept all,
  then the file is listed for Compare with the base, the saved text and the run's.
- Given run `01JD8Q` ran with history off and history is on now,
  when the person accepts its proposal,
  then it is written from the run's copy.
- Given run `01JD8Q`'s copy was deleted outside Halonic,
  when the Inbox asks about its proposal,
  then it is unavailable.
- Given the workspace has more files than a copy may hold,
  when a run starts with history off,
  then it fails with "the workspace is too big to run with history off (more than 10,000 files). Turn history on, or open a smaller folder.", and no copy is left.
