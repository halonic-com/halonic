# workflows.runs

- Status: draft
- Since: 0.1.0
- Source: HAL-10170 (T7 PR 5a); flow-workflows 8; microcopy 9.7; states C6, R10, R15, R21; UX checklist 3.7, UX 10.14, W-D3

When a workflow's Runs view opens, the workflows feature shall list only that workflow's real runs, never test runs, as **Now** (running and waiting) and then **Earlier** (the 20 newest finished), each row with its status chip, short id, line and time, and **See all** under them that opens the Runs list; the Runs tab shall carry an amber count of the runs that need the person; with no runs it shall say "No runs yet. Press **Run** to start one."; while the runs load it shall show a skeleton and "Loading runs"; when they can't be read it shall say "Couldn't load runs", the reason and **Try again**; and picking a row shall dock the simple run card at the right with the status, the line, who started it, the steps so far and **Open the run log**.

## Examples

- Given a real run and a test run of this workflow and a run of another workflow, then only the real run is listed.
- Given one running run and 25 finished runs, then **Now** has one row and **Earlier** the 20 newest finished.
- Given two runs that need the person, then the Runs tab shows a count of 2.
- Given no runs, then the view says "No runs yet. Press Run to start one."
- Given the source can't list the runs, then the view says "Couldn't load runs" with the reason and **Try again**.
- Given the person picks a row, then its card shows the status, the line and **Open the run log**, which opens the run's page.
