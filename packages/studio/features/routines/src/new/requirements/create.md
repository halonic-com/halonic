# routines.new.create

- Status: draft
- Since: unreleased
- Source: HAL-1306 (T12 PR 4); flow-routines 2.2; microcopy 12.2; G5 T12-F19 and F20; HAL-12751; HAL-13498

When the user chooses **New routine**, the routines feature shall ask for a name, and for a hub when there is more than one, in a "New routine" dialog that shows the file the routine will be written to and says what it will run, and, when it will run an agent, a **Prompt** that starts empty with the hint "Describe what to do." and the line "Say what *Name* should do.", create the routine through the host, close the dialog and open the routine in its tab, and, while the name is empty, not create anything and say "Give it a name." under the field, and while an agent's prompt is empty, not create anything, focus **Prompt** and mark "Say what *Name* should do." as its error. When the chosen hub has no workflow and no agent, the dialog shall say "Create a workflow or an agent first; a routine runs one of them." instead of offering Create, and, when the app can open the New workflow dialog, show **New workflow**, which closes the dialog and opens it.

## Examples

- Given one hub "acme", then the dialog has **Name**, focused, and no Hub field, and the line "Folder: hubs/acme/workflows/routines/".
- Given acme's first workflow is "Briefing", then the dialog says "It runs Briefing when you press Run now. Pick when it runs on its own next." and has no **Prompt**; given acme has no workflow and its first agent is "Analyst", it says "This routine starts Analyst, but Halonic can't run an agent on its own yet, only as a step in a workflow. Make a workflow, then pick it under Starts on the routine's page." and shows an empty **Prompt** with the hint "Describe what to do." and "Say what Analyst should do." under it.
- Given the routine runs Analyst and its prompt is empty, then **Create** focuses **Prompt** and creates nothing; given the prompt "Sum up the inbox", **Create** creates the routine with that prompt.
- Given the hubs "acme" and "beta", then a **Hub** field lists both, and picking "beta" changes the line to "Folder: hubs/beta/workflows/routines/" and the line about what it runs.
- Given the name "Morning digest", then the line reads "File: hubs/acme/workflows/routines/morning-digest.routine.yaml"; given acme already has `morning-digest`, it reads `morning-digest-2.routine.yaml`.
- Given the user presses **Create** with the name "Morning digest", then the host creates it in the picked hub and its tab opens.
- Given the name is empty, then **Create** shows "Give it a name.", focuses Name and creates nothing.
- Given the host can't write the file because "the disk is full", then the dialog says "Couldn't create the routine: the disk is full." and **Create** tries again.
- Given the hub has nothing to run, then the dialog says "Create a workflow or an agent first; a routine runs one of them." and has no **Create**; given the app can open New workflow, **New workflow** closes the dialog and opens it, and otherwise there is no such button.
- Given the window is a phone and the hub has nothing to run, then the dialog has no **New workflow**, as a phone doesn't edit workflows (UX 10.15).
- Given the routines page, then Ctrl K's **New routine** opens the Routines place with the dialog open, and **New routine** on the list and in the empty state opens it too.
