# runs.list

- Status: active
- Since: unreleased
- Source: HAL-1301 (T8); ux-checklists-t8-t9 (HAL-1360) revision 10, 1.1 to 1.4; states (HAL-5896) R1 to R6, R10 to R12, R17 and R18; microcopy revision 94, 15.1 (HAL-751)

The Runs list shall show "Runs", the sentence "A run is one time a workflow or agent does its job.", the status chips All, Live, Needs you and Failed with counts on Live and Needs you, the Test runs chip, off at first, and then the runs newest first under a heading for the day they started. Failed shall take every Stopped run too. With Test runs off, a finished test run shall be hidden, and a live one shall show with its Test tag. With no runs at all, the list shall show "No runs yet" with no filters above it and, under it, "Runs started from the command line show up here. To start one, type `halonic run *name*` in a terminal." with *name* the first workflow in the Workflows list's order, or "Runs started from the command line show up here. This workspace has no workflow yet: add one in Workflows." when the workspace has none, or the same sentence without a name while the names are loading or can't be read (HAL-10128); with only finished test runs hidden, "Only test runs so far." with Show test runs; and with a status chip that has none, its own line with no button. While the first list loads it shall show skeleton rows; when that load fails, "Couldn't load runs" with Try again; and when a later load fails, it shall keep the rows under "The engine isn't answering. Showing what it said last.". When another place asks for one workflow's runs, as a workflow's **See all** does, the Runs list shall open with a "Workflow: *name*" chip, pressed, and show only that workflow's runs, with the counts on Live and Needs you over them; pressing the chip shall show every workflow, and the next plain opening shall show every workflow; a workflow with no run shall say "No runs of this workflow yet." with Show every workflow (HAL-10177). A refresh shall update the rows in place, and the sidebar's Runs shall have a dot, read "1 running", while a run is running.

On a phone, the Runs list shall be the same page with the heading left to screen readers (the top bar says "Runs"), the status chips on one row and Test runs on the row under it, and each run as three lines: its workflow with its status chip on the right, the line under What ran, then its Test tag first when it is a test run, its short id, what started it and when, with no chevron and no ⋮ (HAL-10580, checklist 1.14). The phone's Search and hub picker come with the desktop's text and hub filters.

## Examples

- Given runs that started today and yesterday,
  when the Runs list opens,
  then it shows them newest first under "Today" and "Yesterday".
- Given a failed run, a run stopped at its budget and a cancelled run,
  when the Failed chip is picked,
  then all three show.
- Given a finished test run and a test run that waits for you,
  when the Runs list opens,
  then only the waiting one shows, with its Test tag, until Test runs is turned on.
- Given only finished test runs,
  when the Runs list opens,
  then it says "Only test runs so far.", and Show test runs shows them.
- Given no run that needs you,
  when the Needs you chip is picked,
  then the list says "Nothing is waiting for you.".
- Given an engine that doesn't answer,
  when the Runs list first loads,
  then it says "Couldn't load runs" and "The engine isn't answering. It may still be starting.", with Try again.
- Given a run of Support reply and a run of Order intake,
  when the Runs list opens for Support reply,
  then it shows only the Support reply run under a pressed "Workflow: Support reply" chip, and pressing the chip shows both.
- Given a workflow with no run,
  when the Runs list opens for it,
  then it says "No runs of this workflow yet.", and Show every workflow shows the others.
- Given a running run,
  when the sidebar shows Runs,
  then it has a dot, read "1 running".
