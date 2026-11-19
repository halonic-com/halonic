# workflows.list.rows-and-states

- Status: draft
- Since: unreleased
- Source: HAL-9747 (T7 PR 2); flow-workflows 2.1; microcopy 9.1; states C1, C5; kit T7-F22, F25 to F28; HAL-12278

The Workflows place shall list the workspace's workflows under "Workflows" in one section per hub, each row with the workflow's letter avatar, its name, its description under the name, its chips and its **Last run** (**N needs you** when runs wait for a person, else **N running**, then **△ N warnings**, or **✕ N problems** when any is an error), open a workflow in its tab when a row is chosen, and show the loading, empty, no-match and can't-load states in the approved words.

## Examples

- Given hubs "acme" and "beta" and the workflows "Mail triage" (1 run waiting) and "Invoice intake" (2 warnings) in acme,
  then acme lists "Invoice intake" and "Mail triage" with the chips "△ 2 warnings" and "1 needs you", and beta says "No workflows in beta yet.".
- Given a workflow with a run waiting and another running, then its row shows only "1 needs you".
- Given a workflow with one error and one warning, then its row shows "✕ 2 problems".
- Given a workflow with the description "Sorts the inbox every morning." whose newest run failed at 09:05 today, then its row shows that sentence under the name and "Last run ✕ Today 09:05"; a finished run has ✓ or ✕, and a workflow that never ran has no Last run.
- Given the user chooses the row "Mail triage" in acme, then its tab opens.
- Given no workflow in any hub, then the page shows "No workflows yet", the sentence "A workflow is a set of steps your agents work through, one after the other." and **New workflow**, and no search field, no hub chips and no other New workflow button.
- Given the user searches for "zzz", then the page says `No workflows match "zzz".` with **Clear search**.
- Given the workflows are being read, then screen readers hear "Loading workflows".
- Given the first read failed, then the page shows "Couldn't load workflows", "The engine isn't answering. It may still be starting." (worded for the window's host: "Halonic on your computer isn't answering." on a phone) and **Try again**, which shows the loading rows while it reads again.
- Given a read fails after the list was shown, then the rows stay and a line "The engine isn't answering. Showing what it said last." with **Try again** shows above them.
- Given a row with problems, then its chip reads "2 problems" to a screen reader, without the symbol.
- Given the user Ctrl-clicks, middle-clicks or presses Ctrl Enter on a row, then its page opens in a new tab.
- Given the window is a phone, then the heading and sentence are there for screen readers only, because the top bar names the page.
- Given the window is a phone, then the page has no **New workflow**, in the list or in its empty state, because a phone doesn't edit workflows (UX 10.15).
- Given the user runs **New workflow** from Ctrl K, then the Workflows page opens with the New workflow dialog.
- Given the user searches Ctrl K for a workflow's name, id or description, then it is offered as "Workflow · hub name".
- Given a workflow was created or read, then its tab and page title show its name, not its id.
- Given the host says the workflows changed, then the list reads them again and shows the new rows.
