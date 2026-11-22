# cli.commands.proposals.show

- Status: active
- Since: unreleased
- Source: HAL-6477; option 3 on HAL-6476, approved by the board on HAL-9332 (18 Nov); wording decided by the team (HAL-2282); "reject" for Studio's Reject, decided by the team on HAL-16069 (HAL-16071); gone texts say to remove them from the list with `reject`, decided by the team (HAL-16153, C681 row 38; HAL-16162); "Remove run <id> from the list" and exit 5 in place of 9, decided by the team (C710 finding 2 on HAL-16446, HAL-16449)

The `halonic proposals show <run-id>` command shall show one open run proposal, found by the run's short id or full id in any case. It shall start with "Run <short id> proposes changes to <n> files in <workspace>." Then, after a blank line each, every file in path order: how the run changed it (added, modified or deleted) and its path, with its decision in brackets, dimmed, once decided. Under an undecided file it shall print a unified diff, indented, from the saved file as it is now to the run's text, with three unchanged lines of context, as the Studio's Compare reads them (`RunProposals.compare`). A last line with no newline shall be followed by git's line `\ No newline at end of file`, so a change to only the final newline shows. A file changed since the run shall say that Accept won't write it, above its diff; a file that already has the run's changes shall say so instead of a diff. While a file is left to decide, it shall end, after a blank line, with how to accept or reject. It shall change nothing. All paths and file text are outside text and shall be made printable. With `--json`, it shall give the proposal as recorded and each file's diff lines. An unknown id shall stop with the way to the list (`not_found`); a short id that two proposals end in, with the way to the full ids (`invalid_input`); a proposal whose texts were deleted outside Halonic, with the way to remove the run from the list, `halonic proposals reject` with the run id (`conflict`: the proposal is still listed, but can't be shown, so not `unavailable`, whose exit 9 says to try again). No run id or more than one shall be a usage error. Every suggested command shall keep the user's `--dir`.

## Examples

- Given run `01JD8Q` changed `notes/today.md` from `Two tickets.` to `Three tickets.`,
  when the person runs `halonic proposals show 01jd8q`,
  then it prints `modified  notes/today.md`, then `@@ -1,1 +1,1 @@`, `-Two tickets.` and `+Three tickets.`, indented.
- Given the person edited `notes/today.md` since the run,
  when they show the proposal,
  then the file says Accept won't write it, and the diff is from their edit.
- Given the run only added a newline at the end of `notes/a.md`,
  when the person shows the proposal,
  then the diff removes the last line, marked `\ No newline at end of file`, and adds it back with its newline.
- Given the texts of run `01JD8Q`'s proposal were deleted outside Halonic,
  when the person shows the proposal,
  then it says "Run 01jd8q's changes were deleted outside Halonic, so they can't be shown or accepted." and "Remove run 01jd8q from the list with halonic proposals reject 01jd8q.", and exits 5.
