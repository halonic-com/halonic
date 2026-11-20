# source-control.create-version

- Status: active
- Since: unreleased
- Source: HAL-1302 (T9); HAL-12857 (an item's kind and icon as the list has them); ux-checklists-t8-t9 (HAL-1360) part 2, 2.6 (the suggested name is built from the items' sentences); save model 2.6 and 2.7 (HAL-1102): no "Save first", Important settings first as before → after; req-source-control (HAL-110) revision 4: `commit.ctrl-enter`, `commit.save-first` dropped

When the person presses Create version on the Changes page, or another screen opens it for some items, the source control feature shall open a dialog with a name that is offered and selected, notes, and what's in the version, each item with the icon, name and kind the Changes list gives it, with the Important changes first, marked Important, and shown as before → after. It shall not ask to save first. When the version holds one item whose sentence says what changed, because Halonic described one of its files or the item was renamed, the offered name shall be the item's name and the sentence its row shows, joined by " · ". If the version holds more items, or no sentence says what changed, the offered name shall be "Changes to" with the item's name, the two items' names, or the number of items, and the first version of a workspace shall be offered "First version". Ctrl Enter (Cmd Enter on macOS) in any field shall create the version, and Enter in Notes shall add a line. An empty name shall say "Give this version a name." under Name and focus it, and the button shall not be disabled beforehand. Creating shall record only the files in the dialog, with the name as the first line of the message and the notes after an empty line, then show the toast `Created version "<name>"`, close the dialog, and, once the page has read again, move focus to the new version's row in History, its first row, even when changes are left (WCAG 2.4.3, a11y check C1, HAL-12616). Cancel or Escape shall give focus back to the button that opened the dialog. When git refuses, the dialog shall stay open with "Couldn't create the version." and git's reason, and keep the name and notes.

What's in it shall be an `h3` under the dialog's title and name its list. Each item's checkbox shall be named by the item and described by what changed in it, "Deleted" or its list of changes (WCAG 1.3.1, a11y check C3 and C4, HAL-12618).

Not covered yet: the tests line, "Share with your team right away", the first-time "Who should versions be from?" and "Ask for review" (HAL-3227).

## Examples

- Given three changed files,
  when the person presses Create version,
  then the dialog lists all three, its name reads "Changes to 3 items" and is selected.
- Given the workflow "Weekly report" and its routine changed,
  then the dialog shows "Weekly report" twice, once with "Workflow" and once with "Routine".
- Given a screen opens Create version for `agents/triage.agent.yaml` only, and its instructions changed,
  then the dialog lists that file alone, the name reads "Triage · Instructions edited: 1 sentence changed", and creating records only that file.
- Given only `README.md` changed, which Halonic can't describe,
  then the name reads "Changes to README.md".
- Given the agent `support` was renamed to `triage`, in a file Halonic can't describe,
  then the name reads "triage · Renamed from support".
- Given two agents changed, both described,
  then the name reads "Changes to triage and sorter".
- Given the agent's instructions and model changed,
  then Instructions comes first with "Important", its text before and after, and Model follows as a sentence.
- Given the name is empty and the person presses Create version,
  then "Give this version a name." shows under Name, focus is in Name, and nothing is recorded.
- Given the person types a name and presses Ctrl Enter in Notes,
  then the version is created.
- Given git is refused, then the dialog stays open with the reason, and the name and notes are as typed.
- Given every change goes into the version,
  when the dialog closes and Create version is gone,
  then focus is on the new version's row in History.
