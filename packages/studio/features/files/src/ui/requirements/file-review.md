# files.ui.file-review

- Status: active
- Since: unreleased
- Source: HAL-16807 (T14 PR 15, HAL-1307); AI changes 1.2, "In a file" (Accept and Reject per part, Accept file and Reject file in the file's bar) and 1.3 (one undo step each, the toast) (HAL-3228); T14 review panel notes 1, 3 and 4 (HAL-3820)

Where a file open in its tab has changes the assistant made that are still to review, the tab shall mark each part in the editor with its own **Accept** and **Reject**, and show the shell's item bar above the editor: "The assistant changed <n> things here", "<at> of <n>" with **Previous** and **Next**, which put the editor's cursor on that part, and **Accept file** and **Reject file** in place of Accept all and Reject all. For a file the assistant created, the bar's Reject file and the Reject of its only part shall read "Reject and delete file". Each Accept or Reject shall show the toast "Accepted <n> changes in <file>" or "Rejected <n> changes in <file>" ("1 change" for one) with **Undo**, which puts the decision back. When a decision finds the file changed outside Halonic, the bar shall show "Changed outside Halonic" with **Compare** in place of its decisions until the changes to review change again. When a decision was made on parts read before the file changed, the tab shall read the parts again quietly and show no toast. Without the app's review service, or without changes to review, the tab shall show neither marks nor bar.

## Examples

- Given the assistant changed lines 2 and 5 of `models.yaml`,
  when the file opens,
  then both parts are marked in the editor and the bar reads "The assistant changed 2 things here", "1 of 2", Accept file and Reject file.
- Given the same,
  when the user presses Next,
  then the editor's cursor goes to the second part.
- Given the same,
  when the user presses Reject on the first part,
  then the toast says "Rejected 1 change in models.yaml" with Undo, and Undo puts that part back.
- Given the same,
  when the user presses Accept file,
  then the toast says "Accepted 2 changes in models.yaml".
- Given the file changed outside Halonic,
  when the user presses Accept file,
  then the bar shows "Changed outside Halonic" and Compare, and no toast.
- Given the assistant created `notes/plan.md`,
  when it opens,
  then the bar's Reject reads "Reject and delete file".
