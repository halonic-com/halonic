# cli.commands.proposals.show

- Status: active
- Since: unreleased
- Source: HAL-6477; option 3 on HAL-6476, approved by the board on HAL-9332 (18 Nov); wording decided by the team (HAL-2282)

The `halonic proposals show <run-id>` command shall show one open run proposal, found by the run's short id or full id in any case. It shall start with "Run <short id> proposes changes to <n> files in <workspace>." Then, after a blank line each, every file in path order: how the run changed it (added, modified or deleted) and its path, with its decision in brackets, dimmed, once decided. Under an undecided file it shall print a unified diff, indented, from the saved file as it is now to the run's text, with three unchanged lines of context, as the Studio's Compare reads them (`RunProposals.compare`). A file changed since the run shall say that Accept won't write it, above its diff; a file that already has the run's changes shall say so instead of a diff. It shall change nothing. All paths and file text are outside text and shall be made printable. With `--json`, it shall give the proposal as recorded and each file's diff lines. An unknown id shall stop with the way to the list (`not_found`); a short id that two proposals end in, with the way to the full ids (`invalid_input`); a proposal whose texts were deleted outside Halonic, saying so (`unavailable`). No run id or more than one shall be a usage error. Every suggested command shall keep the user's `--dir`.

## Examples

- Given run `01JD8Q` changed `notes/today.md` from `Two tickets.` to `Three tickets.`,
  when the person runs `halonic proposals show 01jd8q`,
  then it prints `modified  notes/today.md`, then `@@ -1,1 +1,1 @@`, `-Two tickets.` and `+Three tickets.`, indented.
- Given the person edited `notes/today.md` since the run,
  when they show the proposal,
  then the file says Accept won't write it, and the diff is from their edit.
