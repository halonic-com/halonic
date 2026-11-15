# source-control.create-version

- Status: active
- Since: 0.1.0
- Source: HAL-1302 (T9); ux-checklists-t8-t9 (HAL-1360) part 2, 2.6; save model 2.6 and 2.7 (HAL-1102): no "Save first", Important settings first as before → after; req-source-control (HAL-110) revision 4: `commit.ctrl-enter`, `commit.save-first` dropped

When the person presses Create version on the Changes page, or another screen opens it for some items, the source control feature shall open a dialog with a name that is offered and selected, notes, and what's in the version, with the Important changes first, marked Important, and shown as before → after. It shall not ask to save first. Ctrl Enter (Cmd Enter on macOS) in any field shall create the version, and Enter in Notes shall add a line. An empty name shall say "Give this version a name." under Name and focus it, and the button shall not be disabled beforehand. Creating shall record only the files in the dialog, with the name as the first line of the message and the notes after an empty line, then show the toast `Created version "<name>"`, close the dialog, and move focus to the page heading. When git refuses, the dialog shall stay open with "Couldn't create the version." and git's reason, and keep the name and notes.

Not covered yet: the tests line, "Share with your team right away", the first-time "Who should versions be from?" and "Ask for review" (HAL-3227).

## Examples

- Given three changed files,
  when the person presses Create version,
  then the dialog lists all three, its name reads "Changes to 3 items" and is selected.
- Given a screen opens Create version for `agents/triage.agent.yaml` only,
  then the dialog lists that file alone, the name reads "Changes to triage", and creating records only that file.
- Given the agent's instructions and model changed,
  then Instructions comes first with "Important", its text before and after, and Model follows as a sentence.
- Given the name is empty and the person presses Create version,
  then "Give this version a name." shows under Name, focus is in Name, and nothing is recorded.
- Given the person types a name and presses Ctrl Enter in Notes,
  then the version is created.
- Given git is refused, then the dialog stays open with the reason, and the name and notes are as typed.
