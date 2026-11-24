# cli.commands.proposals.decide

- Status: active
- Since: unreleased
- Source: HAL-6477; option 3 on HAL-6476, approved by the board on HAL-9332 (18 Nov): nothing changes in the person's files until they accept; wording decided by the team (HAL-2282); `reject` for Studio's Reject (microcopy 1.2), with `discard` kept as an old word, decided by the team on HAL-16069 (HAL-16071); a changed file's line names `reject` with the file and gone texts say to remove them from the list, decided by the team (HAL-16153, C681 rows 37 and 38; HAL-16162); the removed line in Studio's words, decided by the team (C710 finding 2 on HAL-16446, HAL-16449)

The `halonic proposals accept <run-id> [<file>]` command shall accept the open proposal of the run, found as `show` finds it, or only the one file named, through `RunProposals.accept` (`app.run-proposal-accept`): each undecided file is written only while the saved file is still the run's base. It shall name the files it wrote. A file the person changed since the run shall not be written, stay undecided, and be named with a pointer to Compare in Halonic Studio and the way to keep it as it is now, `halonic proposals reject` with the run id and the file (`<file>` when there are several), and the command shall then exit 5 (`conflict`). A file Halonic may never write (under `.git` or `.halonic`) shall be named too. The `halonic proposals reject <run-id> [<file>]` command shall reject the proposal, or the one file, through `RunProposals.reject` (`app.run-proposal-reject`), say how many files' changes it rejected, and leave the saved files as they are; `halonic proposals discard`, its word before, shall still run it (`cli.subcommand-aliases`). For a proposal whose texts were deleted outside Halonic, it shall remove the proposal instead (`app.run-proposal-unavailable`) and say "Removed run <short id> from the list: its changes were deleted outside Halonic.", as Studio's Remove from Inbox says it removed the run. The CLI has no Undo, so after either, a proposal with no file left to decide shall be settled at once (`app.run-proposal-done`) and the command shall say the proposal is done; otherwise it shall say how many files are still to decide and the way to see them. Neither shall start a run, a routine, a hook or a tool, open an engine or take the engine lock. A file the proposal doesn't change shall stop with the way to see its files (`not_found`); an unknown id, a short id two proposals end in and gone texts for accept, as for `show`. No run id, or more than one file, shall be a usage error. Every suggested command shall keep the user's `--dir`.

## Examples

- Given run `01JD8Q` proposes `notes/today.md`,
  when the person runs `halonic proposals accept 01jd8q`,
  then `notes/today.md` holds the run's text, and the command says it wrote it and the proposal is done.
- Given the person edited `notes/today.md` since the run,
  when they accept the proposal,
  then the file keeps their edit, the command says "notes/today.md changed since the run, so it wasn't written. Compare it in Halonic Studio, or reject it with halonic proposals reject 01jd8q notes/today.md to keep it as it is now.", and exits 5.
- Given run `01JD8Q` proposes 2 files,
  when the person runs `halonic proposals reject 01jd8q notes/today.md`,
  then the saved files are unchanged, and the command says 1 file is still to decide.
- Given the texts of run `01JD8Q`'s proposal were deleted outside Halonic,
  when the person runs `halonic proposals reject 01jd8q`,
  then the proposal is removed, the saved files are unchanged, and the command says "Removed run 01jd8q from the list: its changes were deleted outside Halonic." and exits 0.
