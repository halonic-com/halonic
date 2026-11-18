# app.workspace-reload-outside

- Status: active
- Since: unreleased
- Source: HAL-10534, HAL-10832; save model 1.7, flow-files 4.6

When files changed outside Halonic and have no unsaved changes, the kernel shall take in their new text as one undo step labelled "Changed outside Halonic", so they read the new text and a save expects it. It shall leave a file with unsaved changes alone and list it as held, and it shall leave out a file Halonic never read and a file whose text did not change. When the user undoes the step, then each file shall read its older text as an unsaved change, and the next save shall write it over the outside text. A file that is gone outside Halonic shall be taken in as a delete the same way. A file that Halonic read or wrote again while the kernel took it in shall keep that newer text, and a save that is running shall finish before the kernel takes files in.

## Examples

- Given Halonic read `a.yaml` and `b.yaml` and another program changed both,
  when the kernel takes in both,
  then both read the new text, nothing is unsaved and undo is one step.
- Given the same files and the user then undoes,
  then both are unsaved with their older text, and saving writes them.
- Given the user has unsaved changes to `a.yaml` and another program changed it,
  when the kernel takes in `a.yaml`,
  then `a.yaml` is held and its text and unsaved changes are unchanged.
- Given another program deleted `a.yaml`,
  when the kernel takes it in,
  then `a.yaml` reads as missing, and undo brings its text back as unsaved.
- Given a save is writing `a.yaml` and the watch reports the write,
  when the kernel takes in `a.yaml`,
  then it waits for the save, and `a.yaml` is neither held nor taken in.
- Given the kernel reads `a.yaml` from the store and a save writes newer text meanwhile,
  when the read ends,
  then the saved text stays, nothing is taken in and the next save works.
