# runs.list-column

- Status: active
- Since: unreleased
- Source: HAL-20729 (P5 of the HAL-20617 build plan, the two-column layout in the `team-handover` document); HAL-20673 rail flows, lines 31 to 35, revision 2

The Runs page shall show the Runs app's list (`runs.app-list`) in a list column of about 34% of the page, at most 380px wide, and beside it, past a 1px line, a content pane. When the person clicks a row or presses Enter on it, the content pane shall show that run's page and the row shall become the list's current row. When the person Ctrl-clicks, Cmd-clicks or middle-clicks a row, the Studio shall open the run's page in a new tab and leave the content pane as it is. The rows of an agent's run, which has no page yet, shall open nothing. While no run is open, the content pane shall say "No run open" with "Pick a run in the list to see its steps." under it. When the run page in the content pane opens another run without asking for a step, such as a run started again, the content pane shall show that run. While the Studio shows one pane at a time, on a phone or in a window narrower than 900px, the page shall show the list until a run opens, then only the run with "← Runs", which goes back to the list.

## Examples

- Given a wide window and no run open,
  when the Runs page is shown,
  then the list column and the content pane show, and the pane says "No run open".
- Given a workspace's run in the list,
  when the person clicks its row,
  then its page shows in the content pane and its row is the current one.
- Given a workspace's run in the list,
  when the person Ctrl-clicks its row,
  then its page opens in a new tab and the content pane still says "No run open".
- Given a narrow window,
  when the person opens a run and then presses "← Runs",
  then the run shows alone, and then the list shows alone.
