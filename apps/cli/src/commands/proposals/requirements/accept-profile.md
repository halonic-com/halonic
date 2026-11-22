# cli.commands.proposals.accept-profile

- Status: active
- Since: unreleased
- Source: HAL-15764 (show, from Nina's C623 run); HAL-15201 (Liam's approval, question 3: the end-to-end test for gap 1); the shell's `Fence` in the `workspace-files` crate (HAL-7039)

When a proposal adds or changes a file inside the profile folder, and the workspace holds that folder (the home folder as the workspace, with the default profile), the `halonic proposals accept` command shall not write that file, through the folder definition store's profile fence (`fs-node.definition-store-profile-fence`). It shall write the proposal's other files as usual and name the profile file among the files that can't be written, as it names a file under `.git` or `.halonic` (`cli.commands.proposals.decide`).

The `halonic proposals show` command shall show such a proposal: it shall label the profile file "can't be written", without a diff, and show the other files as usual (`app.run-proposal-compare-refused`).

## Examples

- Given the home folder is the workspace, and run `01JD8Q` proposes `<profile>/unfenced-runs/x` and `notes/new.md`,
  when the person runs `halonic proposals accept 01jd8q`,
  then the command says it wrote 1 file, `notes/new.md`, names `<profile>/unfenced-runs/x` as a file that can't be written, because "Halonic never writes inside .git, .halonic or its own data folder", and nothing is made in the profile.
- Given the same proposal,
  when the person runs `halonic proposals show 01jd8q` before accepting it,
  then it labels `<profile>/unfenced-runs/x` "can't be written", without a diff, and prints the diff of `notes/new.md`.
